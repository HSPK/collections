import type { Board, Circle, Pact, Point, Segment, Shot } from './data';
import { LAUNCH } from './data';

export const STEP_MS = 1000 / 120;
export const MAX_STEPS = 600;
export const MAX_SPEED = 940;
export const BALL_RADIUS = 8;
export interface Contact extends Point { step: number; id: string; kind: 'rail' | 'bumper' | 'pact' | 'chain' }
export interface Frame extends Point { vx: number; vy: number; step: number; hits: Pact[]; score: number }
export interface Flight extends Frame {
  done: boolean; banks: string[]; contacts: Contact[]; special: boolean; linked: boolean;
}
export interface Result {
  frames: Frame[]; contacts: Contact[]; hits: Pact[]; banks: number; score: number; steps: number; end: 'drain' | 'timeout';
}
const round = (value: number) => Math.round(value * 1e6) / 1e6;
export function startFlight(shot: Shot): Flight {
  const radians = shot.angle * Math.PI / 180;
  const speed = 410 + shot.power * 4;
  return { ...LAUNCH, vx: round(Math.sin(radians) * speed), vy: round(-Math.cos(radians) * speed),
    step: 0, hits: [], banks: [], score: 0, done: false, contacts: [], special: shot.special, linked: false };
}
export function nearest(point: Point, segment: Segment): Point {
  const dx = segment.b.x - segment.a.x, dy = segment.b.y - segment.a.y;
  const length = dx * dx + dy * dy;
  const t = length === 0 ? 0 : Math.max(0, Math.min(1, ((point.x - segment.a.x) * dx + (point.y - segment.a.y) * dy) / length));
  return { x: segment.a.x + t * dx, y: segment.a.y + t * dy };
}

// The maximum microstep is 3.92px, below the 8px ball radius, including thin rails.
function resolve(ball: Flight, center: Point, radius: number, restitution: number): boolean {
  let dx = ball.x - center.x, dy = ball.y - center.y;
  const distance = Math.hypot(dx, dy);
  if (distance >= radius) return false;
  if (distance < 1e-9) {
    const speed = Math.hypot(ball.vx, ball.vy) || 1;
    dx = -ball.vx / speed; dy = -ball.vy / speed;
    if (!dx && !dy) dy = -1;
  } else { dx /= distance; dy /= distance; }
  ball.x = center.x + dx * (radius + 0.001);
  ball.y = center.y + dy * (radius + 0.001);
  const into = ball.vx * dx + ball.vy * dy;
  if (into >= 0) return false;
  ball.vx -= (1 + restitution) * into * dx;
  ball.vy -= (1 + restitution) * into * dy;
  return true;
}
function touch(ball: Flight, id: string, kind: Contact['kind']) {
  // Bounded even in a pathological trapped corner.
  if (ball.contacts.length < 96) ball.contacts.push({ id, kind, step: ball.step, x: round(ball.x), y: round(ball.y) });
}
function collect(ball: Flight, id: Pact, kind: 'pact' | 'chain') {
  if (ball.hits.includes(id)) return;
  ball.hits.push(id);
  ball.score += 100 * ball.hits.length + ball.banks.length * 20;
  touch(ball, id, kind);
}
export function stepFlight(ball: Flight, board: Board): void {
  if (ball.done) return;
  ball.step++;
  const dt = 1 / 240;
  for (let micro = 0; micro < 2; micro++) {
    ball.vy += 105 * dt;
    const speed = Math.hypot(ball.vx, ball.vy);
    if (speed > MAX_SPEED) { ball.vx *= MAX_SPEED / speed; ball.vy *= MAX_SPEED / speed; }
    ball.x += ball.vx * dt; ball.y += ball.vy * dt;
    // Two bounded relaxation passes handle endpoints and two-surface corners.
    for (let iteration = 0; iteration < 2; iteration++) {
      for (const rail of [...board.rails, board.shield]) {
        if (resolve(ball, nearest(ball, rail), BALL_RADIUS + 3, 0.94)) {
          if (!ball.banks.includes(rail.id)) ball.banks.push(rail.id);
          touch(ball, rail.id, 'rail');
        }
      }
      for (const bumper of board.bumpers) {
        if (resolve(ball, bumper, BALL_RADIUS + bumper.r, 1.04)) {
          if (!ball.banks.includes(bumper.id)) { ball.banks.push(bumper.id); ball.score += 25; }
          touch(ball, bumper.id, 'bumper');
        }
      }
    }
    for (const target of board.targets) {
      if (Math.hypot(ball.x - target.x, ball.y - target.y) <= BALL_RADIUS + target.r) {
        const fresh = !ball.hits.includes(target.id);
        collect(ball, target.id, 'pact');
        // One visible charge links one other pact after a real bank and a real target hit.
        if (fresh && ball.special && !ball.linked && ball.banks.length > 0) {
          const next = board.targets.filter(other => !ball.hits.includes(other.id))
            .sort((a, b) => Math.hypot(a.x - target.x, a.y - target.y) - Math.hypot(b.x - target.x, b.y - target.y))[0];
          if (next) { ball.linked = true; collect(ball, next.id, 'chain'); }
        }
      }
    }
    if (ball.y > 630) { ball.done = true; break; }
  }
  const speed = Math.hypot(ball.vx, ball.vy);
  if (speed > MAX_SPEED) { ball.vx *= MAX_SPEED / speed; ball.vy *= MAX_SPEED / speed; }
  ball.x = round(ball.x); ball.y = round(ball.y); ball.vx = round(ball.vx); ball.vy = round(ball.vy);
  if (ball.step >= MAX_STEPS) ball.done = true;
}
function frame(ball: Flight): Frame {
  return { x: ball.x, y: ball.y, vx: ball.vx, vy: ball.vy, step: ball.step, hits: [...ball.hits], score: ball.score };
}
export function simulate(board: Board, shot: Shot): Result {
  const ball = startFlight(shot), frames = [frame(ball)];
  while (!ball.done) { stepFlight(ball, board); frames.push(frame(ball)); }
  return { frames, contacts: ball.contacts, hits: ball.hits, banks: ball.banks.length, score: ball.score,
    steps: ball.step, end: ball.y > 630 ? 'drain' : 'timeout' };
}

export interface Solution { shots: Shot[] }
const solutions = new Map<string, Solution | null>();
export function solve(board: Board, required = board.round === 4 ? 3 : 2): Solution | null {
  const key = JSON.stringify([board, required]);
  if (solutions.has(key)) return solutions.get(key)!;
  const candidates: { shot: Shot; hits: Set<Pact> }[] = [];
  for (const power of [85, 100, 70]) {
    for (let angle = -68; angle <= 68; angle += 2) {
      const shot = { angle, power, special: false };
      const result = simulate(board, shot);
      if (result.hits.length >= required) {
        const solution = { shots: [shot] }; solutions.set(key, solution); return solution;
      }
      if (result.hits.length) candidates.push({ shot, hits: new Set(result.hits) });
    }
  }
  // Every pact is reachable individually: at most three ordinary shots, no special required.
  const selected: Shot[] = [], hit = new Set<Pact>();
  for (let i = 0; i < 3 && hit.size < required; i++) {
    candidates.sort((a, b) => [...b.hits].filter(id => !hit.has(id)).length - [...a.hits].filter(id => !hit.has(id)).length);
    const best = candidates[0];
    if (!best || [...best.hits].every(id => hit.has(id))) break;
    selected.push(best.shot); best.hits.forEach(id => hit.add(id));
  }
  const solution = hit.size >= required ? { shots: selected } : null;
  // Only 135 finite board combinations exist (5 rounds × 9 plans × 3 seed offsets).
  if (solutions.size >= 135) solutions.clear();
  solutions.set(key, solution);
  return solution;
}

export function touchesCircle(point: Point, circle: Circle) {
  return Math.hypot(point.x - circle.x, point.y - circle.y) <= BALL_RADIUS + circle.r;
}
