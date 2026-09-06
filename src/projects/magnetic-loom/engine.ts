import { clamp, random } from '../../core/math';
import { BED, DEFAULT_MAGNETS, FILING_COUNT, MAGNET_MARGIN, SEED } from './data';
import { emptySample, polesFor, sampleField } from './field';
import type { Magnet, Pole } from './field';

export const MAX_ACCELERATION = 900;
export const MAX_SPEED = 120;
export const MAX_HOME_DRIFT = 54;
const SPRING = 52;
const DAMPING = 13;
const MAX_DELTA = 0.05;

export interface Filing {
  homeX: number;
  homeY: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  angle: number;
  seedAngle: number;
  targetX: number;
  targetY: number;
  along: number;
  across: number;
  length: number;
  shade: number;
  phase: number;
}

type MagnetEdit = Partial<Pick<Magnet, 'x' | 'y' | 'angle' | 'polarity'>>;

function wrapAngle(angle: number): number {
  return Math.atan2(Math.sin(angle), Math.cos(angle));
}

export class LoomEngine {
  readonly magnets: Magnet[];
  readonly filings: Filing[] = [];
  poles: Pole[];
  time = 0;
  revision = 0;
  private agitation = 0;
  private readonly field = emptySample();
  private readonly shakeRandom: () => number;

  constructor(options: { seed?: number; count?: number } = {}) {
    const seed = options.seed ?? SEED;
    const count = clamp(Math.floor(options.count ?? FILING_COUNT), 64, 6_000);
    const next = random(seed);
    this.shakeRandom = random(seed ^ 0x45fe);
    this.magnets = DEFAULT_MAGNETS.map((magnet) => ({ ...magnet }));
    this.poles = polesFor(this.magnets);
    const groups = Math.ceil(count / 5);
    const width = BED.width - BED.inset * 3;
    const height = BED.height - BED.inset * 3;
    const columns = Math.ceil(Math.sqrt(groups * width / height));
    const rows = Math.ceil(groups / columns);

    for (let group = 0; group < groups; group += 1) {
      const anchorX = BED.inset * 1.5 + ((group % columns) + 0.15 + next() * 0.7) / columns * width;
      const anchorY = BED.inset * 1.5 + (Math.floor(group / columns) + 0.15 + next() * 0.7) / rows * height;
      for (let member = 0; member < 5 && this.filings.length < count; member += 1) {
        const homeX = anchorX + (next() - 0.5) * 3;
        const homeY = anchorY + (next() - 0.5) * 3;
        this.filings.push({
          homeX,
          homeY,
          x: homeX,
          y: homeY,
          vx: 0,
          vy: 0,
          angle: 0,
          seedAngle: next() * Math.PI,
          targetX: homeX,
          targetY: homeY,
          along: (member - 2) * 6.7 + (next() - 0.5) * 2,
          across: (next() - 0.5) * 4.6,
          length: 3 + next() * 4.5,
          shade: Math.floor(next() * 4),
          phase: next() * Math.PI * 2,
        });
      }
    }
    this.refreshTargets();
    this.settle();
  }

  private refreshTargets(): void {
    for (const filing of this.filings) {
      const field = sampleField(filing.homeX, filing.homeY, this.poles, this.field);
      const angle = field.strength > 0.00001 ? Math.atan2(field.y, field.x) : filing.seedAngle;
      const ux = Math.cos(angle);
      const uy = Math.sin(angle);
      const gradient = Math.hypot(field.gradientX, field.gradientY);
      const attraction = gradient > 0 ? 20 * Math.tanh(gradient * 2.5) / gradient : 0;
      filing.targetX = clamp(
        filing.homeX + ux * filing.along - uy * filing.across + field.gradientX * attraction,
        BED.inset,
        BED.width - BED.inset,
      );
      filing.targetY = clamp(
        filing.homeY + uy * filing.along + ux * filing.across + field.gradientY * attraction,
        BED.inset,
        BED.height - BED.inset,
      );
    }
  }

  private align(filing: Filing, amount = 1): void {
    const field = sampleField(filing.x, filing.y, this.poles, this.field);
    if (field.strength < 0.00001) return;
    const target = Math.atan2(field.y, field.x);
    // Iron slivers are axes, not arrows: +B and -B have the same alignment.
    const difference = Math.atan2(Math.sin(2 * (target - filing.angle)), Math.cos(2 * (target - filing.angle))) / 2;
    filing.angle = wrapAngle(filing.angle + difference * amount);
  }

  private constrain(filing: Filing): void {
    const dx = filing.x - filing.homeX;
    const dy = filing.y - filing.homeY;
    const drift = Math.hypot(dx, dy);
    if (drift > MAX_HOME_DRIFT) {
      filing.x = filing.homeX + dx / drift * MAX_HOME_DRIFT;
      filing.y = filing.homeY + dy / drift * MAX_HOME_DRIFT;
      const outward = (filing.vx * dx + filing.vy * dy) / (drift * drift);
      if (outward > 0) {
        filing.vx -= outward * dx;
        filing.vy -= outward * dy;
      }
    }
    if (filing.x < BED.inset || filing.x > BED.width - BED.inset) filing.vx = 0;
    if (filing.y < BED.inset || filing.y > BED.height - BED.inset) filing.vy = 0;
    filing.x = clamp(filing.x, BED.inset, BED.width - BED.inset);
    filing.y = clamp(filing.y, BED.inset, BED.height - BED.inset);
  }

  setMagnet(index: number, edit: MagnetEdit, alignImmediately = false): void {
    const magnet = this.magnets[index];
    if (!magnet) return;
    if (edit.x !== undefined && Number.isFinite(edit.x)) magnet.x = clamp(edit.x, MAGNET_MARGIN, BED.width - MAGNET_MARGIN);
    if (edit.y !== undefined && Number.isFinite(edit.y)) magnet.y = clamp(edit.y, MAGNET_MARGIN, BED.height - MAGNET_MARGIN);
    if (edit.angle !== undefined && Number.isFinite(edit.angle)) magnet.angle = wrapAngle(edit.angle);
    if (edit.polarity === 1 || edit.polarity === -1) magnet.polarity = edit.polarity;
    this.poles = polesFor(this.magnets);
    this.refreshTargets();
    if (alignImmediately) {
      for (const filing of this.filings) this.align(filing);
    }
    this.revision += 1;
  }

  settle(): void {
    for (const filing of this.filings) {
      filing.x = filing.targetX;
      filing.y = filing.targetY;
      filing.vx = 0;
      filing.vy = 0;
      filing.angle = filing.seedAngle;
      this.align(filing);
    }
    this.agitation = 0;
  }

  shake(): void {
    this.agitation = 1;
    for (const filing of this.filings) {
      const angle = this.shakeRandom() * Math.PI * 2;
      const distance = 5 + this.shakeRandom() * 15;
      filing.x += Math.cos(angle) * distance;
      filing.y += Math.sin(angle) * distance;
      filing.vx = Math.cos(angle) * (40 + this.shakeRandom() * 70);
      filing.vy = Math.sin(angle) * (40 + this.shakeRandom() * 70);
      filing.angle += (this.shakeRandom() - 0.5) * 1.6;
      this.constrain(filing);
    }
  }

  step(delta: number): void {
    if (!Number.isFinite(delta) || delta <= 0) return;
    const elapsed = Math.min(delta, MAX_DELTA);
    const substeps = Math.ceil(elapsed * 60);
    const dt = elapsed / substeps;
    const alignment = 1 - Math.exp(-15 * dt);
    for (let step = 0; step < substeps; step += 1) {
      this.time += dt;
      this.agitation *= Math.exp(-4.5 * dt);
      for (const filing of this.filings) {
        const jitter = Math.sin(this.time * 37 + filing.phase) * this.agitation * 24;
        let ax = (filing.targetX - filing.x) * SPRING - filing.vx * DAMPING + jitter;
        let ay = (filing.targetY - filing.y) * SPRING - filing.vy * DAMPING - jitter;
        const acceleration = Math.hypot(ax, ay);
        if (acceleration > MAX_ACCELERATION) {
          ax *= MAX_ACCELERATION / acceleration;
          ay *= MAX_ACCELERATION / acceleration;
        }
        filing.vx += ax * dt;
        filing.vy += ay * dt;
        const speed = Math.hypot(filing.vx, filing.vy);
        if (speed > MAX_SPEED) {
          filing.vx *= MAX_SPEED / speed;
          filing.vy *= MAX_SPEED / speed;
        }
        filing.x += filing.vx * dt;
        filing.y += filing.vy * dt;
        this.constrain(filing);
        this.align(filing, alignment);
      }
    }
  }

  reset(): void {
    for (let index = 0; index < this.magnets.length; index += 1) {
      Object.assign(this.magnets[index], DEFAULT_MAGNETS[index]);
    }
    this.poles = polesFor(this.magnets);
    this.refreshTargets();
    this.settle();
    this.time = 0;
    this.revision += 1;
  }
}
