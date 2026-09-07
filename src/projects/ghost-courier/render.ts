import { canvas2D, pointerPosition } from '../../core/canvas';
import { createLoop } from '../../core/loop';
import { clamp, lerp, random } from '../../core/math';
import type { CityNode, NodeId } from './data';
import { echoAt, exits, forecast, gateOpen, guardPosition, heistOf } from './engine';
import type { State } from './engine';

interface Point { x: number; y: number }
interface SceneOptions {
  signal: AbortSignal;
  reducedMotion: boolean;
  onPick(id: NodeId): void;
}

export function createScene(host: HTMLElement, initial: State, options: SceneOptions) {
  const surface = canvas2D(host, 'Isometric clockwork city. Select an address on the map; use the named route buttons or arrow keys to move.');
  const { canvas, context: ctx, size } = surface;
  canvas.tabIndex = 0;
  let state = initial;
  let selected: NodeId = 'dock';
  let labels = false;
  let paused = options.reducedMotion;
  let scale = 1, ox = 0, oy = 0;
  let from = heistOf(state).nodes[0], target = from, transition = 1;
  const rng = random(7203);
  const skyline = Array.from({ length: 42 }, (_, i) => ({ x: i / 41, h: 20 + rng() * 95, w: 12 + rng() * 24, lit: rng() }));

  function project(x: number, y: number, z = 0): Point {
    return { x: (x - y) * 46, y: (x + y) * 23 - z * 67 };
  }
  function at(node: CityNode): Point { return project(node.x, node.y, node.z); }
  function path(points: Point[], fill: string, stroke?: string, width = 1) {
    ctx.beginPath();
    points.forEach((p, i) => i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y));
    ctx.closePath();
    ctx.fillStyle = fill;
    ctx.fill();
    if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = width; ctx.stroke(); }
  }
  function line(a: Point, b: Point, color: string, width = 1) {
    ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y);
    ctx.strokeStyle = color; ctx.lineWidth = width; ctx.stroke();
  }
  function box(x: number, y: number, w: number, d: number, top: number, bottom: number, roof = '#555b51') {
    const a = project(x, y, top), b = project(x + w, y, top);
    const c = project(x + w, y + d, top), e = project(x, y + d, top);
    const bb = project(x + w, y, bottom), cb = project(x + w, y + d, bottom), eb = project(x, y + d, bottom);
    path([b, c, cb, bb], '#252b28', '#61685a40');
    path([e, c, cb, eb], '#343b34', '#61685a40');
    path([a, b, c, e], roof, '#a5ad8050');
  }
  function tower(x: number, y: number, height: number, time: number, clock = false) {
    box(x, y, .8, .8, height, -1.15, '#4a5046');
    box(x + .1, y + .1, .6, .6, height + .1, height, '#777c67');
    for (let floor = -.8; floor < height - .25; floor += .27) {
      for (let col = 0; col < 3; col++) {
        const light = (Math.round(floor * 10) + col) % 4 !== 0;
        const a = project(x + .12 + col * .22, y + .807, floor);
        const b = project(x + .23 + col * .22, y + .807, floor);
        line(a, b, light ? '#cedd8899' : '#101a16', 3);
        line(project(x + .807, y + .12 + col * .22, floor), project(x + .807, y + .22 + col * .22, floor), '#b9ca6840', 2);
      }
    }
    if (clock) {
      const p = project(x + .4, y + .85, height - .4);
      ctx.save(); ctx.translate(p.x, p.y); ctx.transform(1, .5, 0, 1, 0, 0);
      ctx.beginPath(); ctx.arc(0, 0, 13, 0, Math.PI * 2); ctx.fillStyle = '#cbd996'; ctx.fill();
      ctx.strokeStyle = '#1a241b'; ctx.lineWidth = 2; ctx.stroke();
      line({ x: 0, y: 0 }, { x: Math.sin(time * .05) * 9, y: -Math.cos(time * .05) * 9 }, '#263021', 2);
      line({ x: 0, y: 0 }, { x: -6, y: 3 }, '#263021', 2);
      ctx.restore();
    }
    const tip = project(x + .4, y + .4, height + .8);
    line(project(x + .4, y + .4, height), tip, '#97a17a', 1);
    ctx.fillStyle = '#d8ef79'; ctx.fillRect(tip.x - 1.5, tip.y - 2, 3, 3);
  }
  function figure(p: Point, color: string, ghost: boolean, time: number) {
    const lift = ghost ? Math.sin(time * 2) * 2 : 0;
    ctx.save(); ctx.translate(p.x, p.y + lift);
    ctx.globalAlpha = ghost ? .65 : 1;
    ctx.beginPath(); ctx.ellipse(0, 1, 10, 4, 0, 0, Math.PI * 2);
    ctx.fillStyle = '#050b0990'; ctx.fill();
    ctx.shadowColor = color; ctx.shadowBlur = ghost ? 15 : 7;
    path([{ x: 0, y: -22 }, { x: 6, y: -15 }, { x: 7, y: -2 }, { x: -7, y: -2 }, { x: -5, y: -14 }], color);
    ctx.beginPath(); ctx.arc(0, -24, 4, 0, Math.PI * 2); ctx.fillStyle = color; ctx.fill();
    line({ x: -3, y: -17 }, { x: 3, y: -15 }, '#0d1713', 2);
    if (ghost) { ctx.setLineDash([2, 3]); line({ x: -9, y: 5 }, { x: 8, y: 5 }, color); }
    ctx.restore();
  }
  function flywheel(x: number, y: number, z: number, radius: number, time: number) {
    const p = project(x, y, z);
    ctx.save(); ctx.translate(p.x, p.y); ctx.transform(1, .5, 0, 1, 0, 0);
    ctx.rotate(time * .07);
    const teeth: Point[] = [];
    for (let i = 0; i < 72; i++) {
      const angle = i / 72 * Math.PI * 2;
      const r = radius * (i % 4 < 2 ? 1 : .86);
      teeth.push({ x: Math.cos(angle) * r, y: Math.sin(angle) * r });
    }
    path(teeth, '#3c4635', '#83916a', 1.3);
    ctx.beginPath(); ctx.arc(0, 0, radius * .69, 0, Math.PI * 2);
    ctx.fillStyle = '#152017'; ctx.fill(); ctx.strokeStyle = '#a0ad7655'; ctx.lineWidth = 2; ctx.stroke();
    for (let i = 0; i < 6; i++) {
      const a = i * Math.PI / 3;
      line({ x: Math.cos(a) * 4, y: Math.sin(a) * 4 }, { x: Math.cos(a) * radius * .64, y: Math.sin(a) * radius * .64 }, '#83926a', 3);
    }
    ctx.beginPath(); ctx.arc(0, 0, 5, 0, Math.PI * 2); ctx.fillStyle = '#c6d58a'; ctx.fill();
    ctx.restore();
  }

  function draw(time: number, delta: number) {
    transition = clamp(transition + delta * 7, 0, 1);
    const { width: w, height: h } = size;
    ctx.setTransform(size.dpr, 0, 0, size.dpr, 0, 0);
    ctx.fillStyle = '#111714'; ctx.fillRect(0, 0, w, h);
    const sky = ctx.createLinearGradient(0, 0, 0, h);
    sky.addColorStop(0, '#1d2823'); sky.addColorStop(.55, '#141c18'); sky.addColorStop(1, '#101512');
    ctx.fillStyle = sky; ctx.fillRect(0, 0, w, h);
    for (const b of skyline) {
      const bx = b.x * w, by = h * .37 - b.h;
      ctx.fillStyle = '#28332a55'; ctx.fillRect(bx, by, b.w, b.h + h * .22);
      for (let y = by + 9; y < h * .49; y += 13) {
        ctx.fillStyle = b.lit > .6 ? '#becb6330' : '#81917715';
        ctx.fillRect(bx + 5, y, 3, 2);
      }
    }
    ctx.strokeStyle = '#63735315'; ctx.lineWidth = 1;
    for (let y = 0; y < h; y += 5) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke(); }

    const heist = heistOf(state);
    const points = heist.nodes.map(at);
    const minX = Math.min(...points.map(p => p.x)) - 90;
    const maxX = Math.max(...points.map(p => p.x)) + 100;
    const minY = Math.min(...points.map(p => p.y)) - 110;
    const maxY = Math.max(...points.map(p => p.y)) + 145;
    scale = Math.min((w - 24) / (maxX - minX), (h - 72) / (maxY - minY));
    ox = w / 2 - (minX + maxX) / 2 * scale;
    oy = h / 2 + 15 - (minY + maxY) / 2 * scale;
    ctx.save(); ctx.translate(ox, oy); ctx.scale(scale, scale);
    // A cut-away city slab, with transit light under the playable roof network.
    box(-1.7, 1.5, 8, 6, -1.15, -1.7, '#222e26');
    for (let rail = 0; rail < 5; rail++) {
      line(project(-1.5, 2 + rail, -1.13), project(6.1, 2 + rail, -1.13), '#68725535', 1);
      const x = ((time * .28 + rail * 1.7) % 8) - 1.7;
      line(project(x, 2 + rail, -1.12), project(x + .8, 2 + rail, -1.12), '#cce38c90', 2);
    }
    tower(-1.2, 2, 1.4, time);
    tower(.1, 1.7, 2.5, time, true);
    tower(1.2, 1.5, 1.6, time);
    tower(5.2, 4.9, 1.15, time);
    tower(5.4, 6, .6, time);
    flywheel(5.45, 6.81, -.1, 22, time);
    flywheel(5.88, 6.81, -.28, 11, -time * 2);
    const beam = project(5.8, 6.2, -.95);
    const beamEnd = project(1, 6.2, -.95);
    path([beam, { x: beamEnd.x, y: beamEnd.y - 13 }, { x: beamEnd.x, y: beamEnd.y + 13 }], '#d1e68d0c');
    line(beam, beamEnd, '#c9e99045', 1);

    const sorted = [...heist.nodes].sort((a, b) => a.x + a.y - b.x - b.y);
    for (const n of sorted) {
      box(n.x - .33, n.y - .33, .66, .66, n.z - .05, -1.15, '#656b57');
      const left = project(n.x - .23, n.y + .34, n.z - .28);
      line(left, project(n.x + .23, n.y + .34, n.z - .28), '#c6d69a77', 2);
      for (let z = -1; z < n.z - .3; z += .3) {
        line(project(n.x + .34, n.y - .2, z), project(n.x + .34, n.y + .2, z), '#83925f44', 2);
      }
    }
    const available = exits(state);
    for (const edge of heist.edges) {
      const a = at(heist.nodes.find(n => n.id === edge.a)!);
      const b = at(heist.nodes.find(n => n.id === edge.b)!);
      line({ x: a.x, y: a.y + 5 }, { x: b.x, y: b.y + 5 }, '#050b08', 11);
      line(a, b, '#515b46', 10);
      line(a, b, '#8e9c6a', 1);
      if (available.some(e => e.to === edge.a || e.to === edge.b) && (edge.a === state.position || edge.b === state.position)) {
        ctx.shadowColor = '#d2ed78'; ctx.shadowBlur = 9;
        line(a, b, '#d2ed78', 2.5); ctx.shadowBlur = 0;
      }
      if (edge.switch) {
        const p = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
        const open = gateOpen(state, edge);
        const color = open ? '#d5f287' : '#e59472';
        line({ x: p.x - 7, y: p.y + 6 }, { x: p.x + 7, y: p.y - 6 }, color, 3);
        if (!open) {
          line({ x: p.x - 7, y: p.y + 6 }, { x: p.x - 7, y: p.y - 18 }, color, 2);
          line({ x: p.x + 7, y: p.y - 6 }, { x: p.x + 7, y: p.y - 30 }, color, 2);
          line({ x: p.x - 7, y: p.y - 18 }, { x: p.x + 7, y: p.y - 30 }, '#e5947250', 5);
        }
      }
    }
    for (const echo of state.echoes) {
      ctx.setLineDash([4, 5]);
      for (let i = 1; i < Math.min(echo.length, state.tick + 2); i++) {
        line(at(heist.nodes.find(n => n.id === echo[i - 1])!), at(heist.nodes.find(n => n.id === echo[i])!), '#b4d9ce70', 2);
      }
      ctx.setLineDash([]);
    }
    for (const n of sorted) {
      const p = at(n), active = n.id === state.position;
      ctx.beginPath(); ctx.ellipse(p.x, p.y, n.kind === 'switch' ? 13 : 7, n.kind === 'switch' ? 6 : 3.5, 0, 0, Math.PI * 2);
      ctx.fillStyle = n.kind === 'switch' ? '#cada76' : '#b4bd94'; ctx.fill();
      if (n.id === selected || active) {
        ctx.beginPath(); ctx.ellipse(p.x, p.y, 17, 8, 0, 0, Math.PI * 2);
        ctx.strokeStyle = active ? '#e5ff9f' : '#e8e8d4'; ctx.lineWidth = 1.5; ctx.stroke();
      }
      if (n.kind === 'parcel' && !state.carrying) {
        box(n.x - .11, n.y - .11, .22, .22, n.z + .22, n.z, '#e9eeaf');
      }
      if (n.kind === 'drop') {
        box(n.x - .16, n.y - .16, .32, .32, n.z + .5, n.z, '#91a36b');
        line(project(n.x - .1, n.y + .17, n.z + .36), project(n.x + .1, n.y + .17, n.z + .36), '#edffc1', 2);
      }
    }
    for (const move of forecast(state)) {
      const a = at(heist.nodes.find(n => n.id === move.from)!);
      const b = at(heist.nodes.find(n => n.id === move.to)!);
      path([a, { x: b.x - 9, y: b.y }, { x: b.x + 9, y: b.y + 6 }], '#eaa78222');
      ctx.setLineDash([3, 4]); line(a, b, '#e5947280', 1); ctx.setLineDash([]);
    }
    for (const echo of state.echoes) figure(at(heist.nodes.find(n => n.id === echoAt(echo, state.tick))!), '#a5d9c9', true, time);
    for (const g of state.guards) figure(at(heist.nodes.find(n => n.id === guardPosition(heist, g))!), '#e59874', false, time);
    figure({
      x: lerp(at(from).x, at(target).x, transition),
      y: lerp(at(from).y, at(target).y, transition),
    }, '#e0ff85', false, time);

    // Architectural foreground ribs frame, rather than obscure, the playable addresses.
    line(project(-1.7, 7.5, -1.6), project(6.3, 7.5, -1.6), '#7c88645c', 4);
    for (let x = -1.4; x < 6; x += .35) line(project(x, 7.5, -1.2), project(x, 7.5, -1.65), '#9aa97550', 1);
    ctx.restore();
    for (const n of heist.nodes) {
      if (!labels && n.id !== selected && !['start', 'switch', 'parcel', 'drop'].includes(n.kind)) continue;
      const p = at(n);
      const label = n.id === state.position ? `${n.name.toUpperCase()} / YOU` : n.name.toUpperCase();
      ctx.font = '600 11px ui-monospace, monospace';
      const width = ctx.measureText(label).width + 10;
      const px = clamp(ox + p.x * scale - width / 2, 5, w - width - 5);
      const py = oy + p.y * scale + 11;
      ctx.fillStyle = '#101713e8'; ctx.fillRect(px, py, width, 17);
      ctx.fillStyle = n.id === selected ? '#e4f6bb' : '#bdcba3'; ctx.fillText(label, px + 5, py + 12);
    }
    const fog = ctx.createLinearGradient(0, h * .8, 0, h);
    fog.addColorStop(0, '#11171400'); fog.addColorStop(1, '#111714bb');
    ctx.fillStyle = fog; ctx.fillRect(0, h * .8, w, h * .2);
  }

  const loop = createLoop(draw, { paused: options.reducedMotion });
  canvas.addEventListener('canvasresize', () => loop.requestRender(), { signal: options.signal });
  canvas.addEventListener('pointerdown', event => {
    const p = pointerPosition(event, canvas);
    const nearest = heistOf(state).nodes.map(n => {
      const q = at(n);
      return { id: n.id, distance: Math.hypot(ox + q.x * scale - p.x, oy + q.y * scale - p.y) };
    }).sort((a, b) => a.distance - b.distance)[0];
    if (nearest.distance <= 28) options.onPick(nearest.id);
  }, { signal: options.signal });
  return {
    update(next: State, selection: NodeId) {
      const changed = state.heist !== next.heist || state.position !== next.position;
      const old = heistOf(state).nodes.find(n => n.id === state.position)!;
      state = next; selected = selection;
      if (changed) {
        from = old; target = heistOf(next).nodes.find(n => n.id === next.position)!;
        transition = paused || next.tick === 0 ? 1 : 0;
      }
      loop.requestRender();
    },
    setLabels(value: boolean) { labels = value; loop.requestRender(); },
    direction(key: string): NodeId | undefined {
      const origin = at(heistOf(state).nodes.find(n => n.id === state.position)!);
      const direction = key === 'ArrowRight' ? { x: 1, y: 0 } : key === 'ArrowLeft' ? { x: -1, y: 0 } :
        key === 'ArrowUp' ? { x: 0, y: -1 } : { x: 0, y: 1 };
      return exits(state).map(e => {
        const p = at(heistOf(state).nodes.find(n => n.id === e.to)!);
        const dx = p.x - origin.x, dy = p.y - origin.y;
        return { id: e.to, score: (dx * direction.x + dy * direction.y) / Math.hypot(dx, dy) };
      }).filter(e => e.score > .25).sort((a, b) => b.score - a.score)[0]?.id;
    },
    setPaused(value: boolean) { paused = value || options.reducedMotion; loop.setPaused(paused); },
    destroy() { loop.destroy(); surface.dispose(); },
  };
}
