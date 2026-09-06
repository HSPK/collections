import type { Layout, Profile, World } from './world';

export const PROFILES: Profile[] = [
  { id: 'walker', name: 'Walking', radius: 0.25, margin: 0.05, stepFree: false, speed: 1.25, stairSpeed: 0.65, stairPenalty: 0.65 },
  { id: 'step-free', name: 'Step-free', radius: 0.35, margin: 0.1, stepFree: true, speed: 0.9, stairSpeed: 0.5, stairPenalty: 0.65 },
  { id: 'wide', name: 'Wide load', radius: 0.6, margin: 0.1, stepFree: true, speed: 0.7, stairSpeed: 0.45, stairPenalty: 0.65 },
];
export const PRESETS = [
  { id: 'open', name: '01 / Open house', note: 'Three floors, two ways up. Trace a route from the entrance to the Map Observatory.' },
  { id: 'move', name: '02 / Collection move', note: 'A temporary screen, a narrow gallery door, and an out-of-service lower lift change the available passages.' },
  { id: 'offline', name: '03 / Upper floor offline', note: 'Both connectors to level 02 are closed. Reopen a suitable connector in Edit to restore access.' },
];
export function makeLayout(preset = 'open'): Layout {
  const world: World = {
    name: 'The Meridian Library', width: 26, depth: 20,
    floors: [
      { id: 'g', name: '00 / Exchange', elevation: 0, color: '#d9bea2', voids: [] },
      { id: 'm', name: '01 / Collections', elevation: 4.2, color: '#b6c0a6', voids: [{ x: 10, z: 8, w: 6, d: 4 }] },
      { id: 'u', name: '02 / Observatory', elevation: 8.4, color: '#b9c7ce', voids: [{ x: 10, z: 8, w: 6, d: 4 }] },
    ], walls: [], doors: [], obstacles: [], rooms: [], portals: [],
  };
  const titles = [
    ['Cartography hall', 'Entrance hall', 'Object gallery', 'Courtyard cafe'],
    ['Special collections', 'Reading room', 'Print room', 'Listening room'],
    ['Sky archive', 'Conservation studio', 'Map Observatory', 'Study of light'],
  ];
  const shorts = [['MAPS', 'ENTRANCE', 'OBJECTS', 'CAFE'], ['ARCHIVE', 'READING', 'PRINTS', 'LISTENING'], ['SKY', 'STUDIO', 'OBSERVATORY', 'LIGHT']];
  world.floors.forEach((floor, f) => {
    const prefix = floor.id;
    world.walls.push(
      { id: `${prefix}-north`, floor: prefix, x: 0, z: 0, axis: 'x', length: 26, thickness: 0.25 },
      { id: `${prefix}-south`, floor: prefix, x: 0, z: 19.75, axis: 'x', length: 26, thickness: 0.25 },
      { id: `${prefix}-west`, floor: prefix, x: 0, z: 0.25, axis: 'z', length: 19.5, thickness: 0.25 },
      { id: `${prefix}-east`, floor: prefix, x: 25.75, z: 0.25, axis: 'z', length: 19.5, thickness: 0.25 },
      { id: `${prefix}-wing-w`, floor: prefix, x: 8, z: 0.25, axis: 'z', length: 19.5, thickness: 0.3 },
      { id: `${prefix}-wing-e`, floor: prefix, x: 17.7, z: 0.25, axis: 'z', length: 19.5, thickness: 0.3 },
      { id: `${prefix}-divide-w`, floor: prefix, x: 0.25, z: 9.85, axis: 'x', length: 7.75, thickness: 0.3 },
      { id: `${prefix}-divide-e`, floor: prefix, x: 18, z: 9.85, axis: 'x', length: 7.75, thickness: 0.3 },
    );
    for (let r = 0; r < 4; r++) {
      const east = r >= 2, south = r % 2 === 1, x = east ? 18.3 : 0.5, z = south ? 10.3 : 0.5;
      world.rooms.push({ id: `${prefix}-room-${r}`, floor: prefix, name: titles[f][r], short: shorts[f][r],
        x, z, w: 7.2, d: 9.2, point: { floor: prefix, x: east ? 22.25 : 3.25, z: south ? 15.25 : 5.25 } });
      world.doors.push({ id: `${prefix}-door-${r}`, wall: `${prefix}-wing-${east ? 'e' : 'w'}`,
        name: `${titles[f][r]} door`, offset: south ? 15 : 5, width: 1.8, open: true });
    }
    world.obstacles.push(
      { id: `${prefix}-shelf-a`, floor: prefix, name: f === 0 ? 'Map cabinet' : 'Long bookcase', x: 1.25, z: 2, w: 4.5, d: 0.75, height: 1.25 },
      { id: `${prefix}-shelf-b`, floor: prefix, name: f === 0 ? 'Reception desk' : 'Reading table', x: 2, z: 17, w: 4, d: 1, height: 0.85 },
      { id: `${prefix}-display`, floor: prefix, name: f === 2 ? 'Meridian globe' : 'Object plinth', x: 20.5, z: 2.5, w: 2, d: 1.5, height: 0.95 },
      { id: `${prefix}-table`, floor: prefix, name: f === 0 ? 'Cafe table' : 'Listening bench', x: 22, z: 17.25, w: 2, d: 1, height: 0.8 },
    );
  });
  world.obstacles.push({ id: 'garden', floor: 'g', name: 'Fern court', x: 10, z: 8, w: 6, d: 4, height: 0.55 });
  for (const [from, to] of [['g', 'm'], ['m', 'u']]) {
    world.portals.push(
      { id: `stair-${from}-${to}`, name: `North stair ${from === 'g' ? '00–01' : '01–02'}`, kind: 'stairs',
        from, to, x: 10.25, z: 1.25, w: 4, d: 4.5, width: 1.4, open: true, wait: 0 },
      { id: `lift-${from}-${to}`, name: `South lift ${from === 'g' ? '00–01' : '01–02'}`, kind: 'lift',
        from, to, x: 15.25, z: 15.25, w: 2, d: 2, width: 1.8, open: true, wait: 8 },
    );
  }
  if (preset === 'move') {
    world.obstacles.push({ id: 'temporary-screen', floor: 'g', name: 'Temporary exhibition wall', x: 8.5, z: 9.5, w: 1, d: 5, height: 2.2 });
    world.obstacles.push({ id: 'archive-crates', floor: 'm', name: 'Archive crates', x: 4.5, z: 12, w: 2.5, d: 4, height: 1.5 });
    world.doors.find((door) => door.id === 'u-door-2')!.width = 0.95;
    world.portals.find((portal) => portal.id === 'lift-g-m')!.open = false;
  } else if (preset === 'offline') {
    world.portals.filter((portal) => portal.to === 'u').forEach((portal) => { portal.open = false; });
    world.obstacles.push({ id: 'conservation-crates', floor: 'u', name: 'Conservation crates', x: 2, z: 12, w: 4, d: 1.5, height: 1.4 });
  }
  return { world, start: { floor: 'g', x: 3.25, z: 15.25 }, end: { floor: 'u', x: 22.25, z: 5.25 },
    profile: { ...PROFILES[0] }, objective: 'comfort' };
}
