import { canvas2D } from '../../core/canvas';
import { createLoop } from '../../core/loop';
import { lerp, random } from '../../core/math';
import { RECIPES, STAFF } from './data';
import type { StaffId, Station } from './data';
import { recipePart } from './engine';
import type { State } from './engine';

const INK = '#453c2c';
const places: Record<Station, [number, number]> = {
  'prep-a': [2.5, 3.1], 'prep-b': [2.5, 4.5], 'hob-a': [3.5, .8], 'hob-b': [5.2, .8],
  'pass-a': [6.4, 3.1], 'pass-b': [6.4, 4.5], none: [4, 5],
};
const homes: Record<StaffId, [number, number]> = { nell: [1.4, 4.5], sol: [3, 1.9], ivo: [5, 4.7] };

export function createKitchen(host: HTMLElement, initial: State, reduced: boolean) {
  const surface = canvas2D(host, 'Isometric kitchen: Nell at prep, Sol at the hobs, Ivo at the pass. Live job descriptions and heat controls are below.');
  const c = surface.context;
  let state = initial, previous = initial, changedAt = -10, elapsed = 0;
  let reducedMotion = reduced;
  const paper = random(79);
  const flecks = Array.from({ length: 650 }, () => [paper() * 920, paper() * 570, paper() * 1.3]);
  const point = (x: number, y: number, z = 0): [number, number] => [445 + (x - y) * 49, 167 + (x + y) * 24 - z * 47];
  function polygon(points: [number, number][], fill: string, stroke = INK) {
    c.beginPath(); points.forEach(([x, y], i) => i ? c.lineTo(x, y) : c.moveTo(x, y)); c.closePath();
    c.fillStyle = fill; c.fill();
    if (stroke) { c.strokeStyle = stroke; c.lineWidth = 1.2; c.stroke(); }
  }
  function top(x: number, y: number, w: number, d: number, z: number, fill: string) {
    polygon([point(x, y, z), point(x + w, y, z), point(x + w, y + d, z), point(x, y + d, z)], fill);
  }
  function box(x: number, y: number, w: number, d: number, h: number, colors: [string, string, string], base = 0) {
    polygon([point(x, y + d, base), point(x + w, y + d, base), point(x + w, y + d, h + base), point(x, y + d, h + base)], colors[1]);
    polygon([point(x + w, y, base), point(x + w, y + d, base), point(x + w, y + d, h + base), point(x + w, y, h + base)], colors[2]);
    top(x, y, w, d, h + base, colors[0]);
  }
  function ellipse(x: number, y: number, rx: number, ry: number, color: string, stroke = '') {
    c.beginPath(); c.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2); c.fillStyle = color; c.fill();
    if (stroke) { c.strokeStyle = stroke; c.lineWidth = 1.5; c.stroke(); }
  }
  function line(a: [number, number], b: [number, number], color: string, width = 2) {
    c.beginPath(); c.moveTo(...a); c.lineTo(...b); c.strokeStyle = color; c.lineWidth = width; c.lineCap = 'round'; c.stroke();
  }
  function print(text: string, x: number, y: number, size: number, color = INK, serif = false) {
    c.font = `${serif ? 'italic ' : '600 '}${size}px ${serif ? 'Georgia' : 'Arial'}`;
    c.fillStyle = color; c.textAlign = 'center'; c.fillText(text, x, y);
  }
  function plate(x: number, y: number, z: number, colors: string[], t: number, steam: boolean) {
    const [px, py] = point(x, y, z);
    ellipse(px + 2, py + 5, 26, 13, '#51442c30');
    ellipse(px, py, 26, 12, '#fcf2d9', '#938773');
    ellipse(px, py, 20, 8, '#e7dfc7');
    colors.forEach((color, i) => {
      for (let j = 0; j < 4; j++) ellipse(px - 12 + j * 7 + i * 3, py - 2 + Math.sin(j + i) * 3, 5, 3.4, color);
    });
    line([px - 4, py - 5], [px + 8, py + 2], '#55723b', 2);
    if (steam) steamLines(px, py - 6, t);
  }
  function steamLines(x: number, y: number, t: number) {
    for (let i = 0; i < 3; i++) {
      const rise = (t * 14 + i * 12) % 42;
      c.beginPath(); c.moveTo(x - 9 + i * 9, y - rise);
      c.bezierCurveTo(x + 8 + i * 4, y - rise - 13, x - 14 + i * 6, y - rise - 20, x + i * 5, y - rise - 29);
      c.strokeStyle = `rgba(255,250,232,${.7 - rise / 80})`; c.lineWidth = 3; c.stroke();
    }
  }
  function worker(id: StaffId, t: number) {
    const info = STAFF.find(item => item.id === id)!;
    const location = (s: State) => {
      const job = s.jobs.find(item => item.staff === id);
      const station = job?.station ?? s.activity[id].station;
      if (station !== 'none') { const p = places[station]; return [p[0] + .5, p[1] + .8] as [number, number]; }
      return homes[id];
    };
    const from = location(previous), to = location(state);
    const blend = reducedMotion ? 1 : Math.min(1, Math.max(0, (elapsed - changedAt) * 1.5));
    const [x, y] = point(lerp(from[0], to[0], blend), lerp(from[1], to[1], blend));
    const working = elapsed - changedAt < 2 && state.phase === 'service' && state.activity[id].kind !== 'wait';
    const move = working ? Math.sin(t * 12 + STAFF.indexOf(info)) * 4 : 0;
    ellipse(x, y + 2, 22, 10, '#483d2b25');
    line([x - 8, y - 7], [x - 12, y + 2], '#3f3b32', 8); line([x + 7, y - 7], [x + 13, y + 3], '#3f3b32', 8);
    c.fillStyle = info.color; c.beginPath();
    c.roundRect(x - (id === 'sol' ? 19 : 15), y - 49, id === 'sol' ? 38 : 30, 43, [12, 12, 5, 5]); c.fill();
    polygon([[x - 9, y - 41], [x + 8, y - 41], [x + 12, y - 12], [x - 12, y - 12]], '#f0e4bd', '');
    line([x - 16, y - 37], [x - 23, y - 24 + move], '#d59d72', 8);
    line([x + 15, y - 37], [x + 27, y - 35 - move], '#d59d72', 8);
    ellipse(x, y - 58, 12, 14, id === 'ivo' ? '#966749' : '#d9a275');
    if (id === 'nell') {
      ellipse(x, y - 69, 15, 7, '#493b2b'); ellipse(x - 13, y - 67, 7, 7, '#493b2b');
      line([x - 12, y - 65], [x + 11, y - 64], '#c7513d', 4);
      line([x + 25, y - 37 - move], [x + 35, y - 43 - move], '#d6d8c8', 4);
    } else if (id === 'sol') {
      ellipse(x, y - 74, 17, 9, '#fff5db'); c.fillStyle = '#fff5db'; c.fillRect(x - 11, y - 75, 22, 12);
      line([x + 24, y - 38 - move], [x + 27, y - 53 - move], '#55472f', 3);
    } else {
      ellipse(x, y - 71, 14, 7, '#383c32');
      line([x - 7, y - 45], [x + 6, y - 44], '#bd473b', 4);
      ellipse(x + 28, y - 37 - move, 16, 5, '#f8ecd2', '#a09377');
    }
    ellipse(x + 4, y - 58, 1.5, 1.5, '#302b23');
    print(info.name, x, y + 24, 15);
  }
  function draw(t: number) {
    elapsed = t;
    const { width, height, dpr } = surface.size;
    c.setTransform(dpr, 0, 0, dpr, 0, 0); c.fillStyle = '#e8dab3'; c.fillRect(0, 0, width, height);
    const scale = Math.min(width / 920, height / 560);
    c.translate((width - 920 * scale) / 2, (height - 560 * scale) / 2); c.scale(scale, scale);
    for (const [x, y, r] of flecks) ellipse(x, y, r, r * .6, '#6f543215');
    ellipse(466, 469, 345, 62, '#6b503b18');
    box(0, 0, 8, 6, .22, ['#d7c8a1', '#beae89', '#ad9b77'], -.22);
    for (let x = 0; x < 8; x++) for (let y = 0; y < 6; y++) top(x + .025, y + .025, .95, .95, .015, (x + y) % 2 ? '#e8dcba' : '#c4c5a0');
    polygon([point(0, 0), point(8, 0), point(8, 0, 3.4), point(0, 0, 3.4)], '#efe4bb');
    polygon([point(0, 0), point(0, 6), point(0, 6, 3.4), point(0, 0, 3.4)], '#dfd3ab');
    for (let x = 0; x <= 8; x++) line(point(x, 0, .5), point(x, 0, 2.6), '#cdbf9b', 1);
    for (let z = .5; z <= 2.6; z += .5) line(point(0, 0, z), point(8, 0, z), '#cdbf9b', 1);
    for (let y = 0; y <= 6; y++) line(point(0, y, .4), point(0, y, 2.7), '#c4b692', 1);
    // Window, timber shelf, hanging pans and enamel clock.
    polygon([point(0, .6, 1.5), point(0, 2.7, 1.5), point(0, 2.7, 3), point(0, .6, 3)], '#829c83', '#675c40');
    line(point(0, 1.65, 1.5), point(0, 1.65, 3), '#f7edcc', 5);
    line(point(0, .6, 2.25), point(0, 2.7, 2.25), '#f7edcc', 5);
    box(.1, 3.2, .35, 2.3, .12, ['#97754a', '#745639', '#80623e'], 2);
    for (let i = 0; i < 4; i++) {
      const [x, y] = point(.25, 3.5 + i * .5, 2.3);
      c.fillStyle = ['#768153', '#bb5943', '#d7ae63', '#557277'][i]; c.fillRect(x - 8, y - 11, 16, 22);
      ellipse(x, y - 11, 8, 3, '#e8d9b3');
    }
    const [cx, cy] = point(6.7, 0, 2.45);
    ellipse(cx, cy, 24, 24, '#b94838', '#703c2e'); ellipse(cx, cy, 19, 19, '#f7edc9');
    line([cx, cy], [cx + Math.sin(state.tick / 6) * 13, cy - Math.cos(state.tick / 6) * 13], INK);
    line([cx, cy], [cx - 8, cy + 3], INK, 3);
    box(.2, .2, 1.5, 1.1, 1.1, ['#bbc1ac', '#73806b', '#5d6d58']);
    top(.45, .35, .8, .65, 1.12, '#778a82');
    const [tapX, tapY] = point(.6, .3, 1.2);
    c.beginPath(); c.arc(tapX + 6, tapY - 7, 9, Math.PI, Math.PI * 2); c.strokeStyle = '#e4e2ce'; c.lineWidth = 4; c.stroke();
    box(2.3, .15, 4, 1.2, 1.12, ['#afb7a6', '#677448', '#53623e']);
    for (const hob of ['hob-a', 'hob-b'] as const) {
      const [x, y] = places[hob], [px, py] = point(x, y, 1.15);
      ellipse(px, py, 33, 17, '#414b41', '#d1d0b9');
      const part = state.orders.flatMap(order => order.parts).find(item => item.hob === hob);
      const heat = state.hobs[hob];
      if (heat > 0) {
        for (let j = 0; j < 9; j++) {
          const angle = j / 9 * Math.PI * 2;
          ellipse(px + Math.cos(angle) * 22, py + Math.sin(angle) * 10, 3, 3 + (reducedMotion ? 0 : Math.sin(t * 5 + j)), heat === 3 ? '#da6836' : '#dba349');
        }
      }
      ellipse(px, py - 6, 28, 13, '#925630', '#4b3d2d'); ellipse(px, py - 9, 26, 11, '#b98149');
      line([px + 23, py - 9], [px + 53, py - 16], '#493e2e', 7);
      if (part) {
        const order = state.orders.find(item => item.parts.includes(part))!;
        ellipse(px, py - 10, 20, 8, recipePart(order, part).color);
        if (part.stage === 'ready') line([px - 13, py - 8], [px + 11, py - 13], '#eedba1', 3);
        if (heat) steamLines(px, py - 20, reducedMotion ? 1 : t);
        print(`${part.heat}/${recipePart(order, part).heat}`, px, py + 35, 14);
      }
      const [knobX, knobY] = point(x, 1.4, .7);
      ellipse(knobX, knobY, 7, 7, '#342e23', '#d2c59e');
      line([knobX, knobY], [knobX + heat * 2 - 3, knobY - 5], '#eddfb9');
    }
    box(2, 2.7, 1.3, state.layout === 'prep' ? 2.6 : 1.25, 1, ['#bc935c', '#e4c16f', '#b5964f']);
    for (let i = 0; i < (state.layout === 'prep' ? 2 : 1); i++) {
      top(2.12, 2.85 + i * 1.3, 1.05, .9, 1.03, '#d8b878');
      const [x, y] = point(2.6, 3.2 + i * 1.3, 1.06);
      for (let j = 0; j < 5; j++) ellipse(x + j * 5 - 10, y + Math.sin(j) * 4, 4, 3, j % 2 ? '#69804b' : '#d18241');
      line([x - 20, y + 8], [x + 8, y + 3], '#d5d8ca', 5); line([x - 29, y + 10], [x - 20, y + 8], '#5b452c', 5);
    }
    box(6, 2.5, 1.35, state.layout === 'pass' ? 2.8 : 1.5, 1.03, ['#c1c7b5', '#ad4336', '#843d30']);
    for (let i = 0; i < (state.layout === 'pass' ? 2 : 1); i++) {
      const order = state.orders.find(item => item.pass === `pass-${i === 0 ? 'a' : 'b'}`);
      plate(6.65, 3.2 + i * 1.25, 1.07, order ? RECIPES[order.recipe].components.map(part => part.color) : [], reducedMotion ? 0 : t, Boolean(order));
    }
    const [beltX, beltY] = point(7.5, 3, .5);
    const conveying = Object.values(state.last).some(job => job.startsWith('Serve')) && elapsed - changedAt < 2;
    const offset = conveying && !reducedMotion ? (t * 8) % 1 : 0;
    for (let j = 0; j < 7; j++) line([beltX + (j + offset) * 4, beltY + (j + offset) * 2], [beltX - 16 + (j + offset) * 4, beltY + 8 + (j + offset) * 2], '#9a9f8c', 2);
    for (const staff of STAFF) worker(staff.id, reducedMotion ? 0 : t);
    box(.3, 5.2, 1.1, .6, .7, ['#b99a5c', '#97753e', '#876a3c']);
    for (let i = 0; i < 6; i++) {
      const [x, y] = point(.5 + (i % 3) * .25, 5.3 + Math.floor(i / 3) * .2, .83);
      ellipse(x, y, 8, 7, i % 2 ? '#889755' : '#d9a75c');
    }
    print('THE LITTLE COPPER', 455, 527, 17);
    print('a kitchen in three sittings', 455, 549, 16, '#776345', true);
  }
  const loop = createLoop(draw, { paused: reduced });
  surface.canvas.addEventListener('canvasresize', loop.requestRender);
  return {
    update(next: State) {
      if (next !== state) { previous = state; state = next; changedAt = elapsed; }
      loop.requestRender();
    },
    setPaused(value: boolean) { reducedMotion = value; loop.setPaused(value); },
    destroy() { surface.canvas.removeEventListener('canvasresize', loop.requestRender); loop.destroy(); surface.dispose(); },
  };
}
