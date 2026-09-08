import { requireRule } from '../agents/errors';
import { integer } from '../agents/schema';

export interface Progression {
  xp: number;
  level: number;
  nextThreshold: number | null;
  remaining: number;
}

function validCurve(thresholds: readonly number[]): void {
  requireRule(thresholds.length > 0 && thresholds.length <= 100 && thresholds[0] === 0,
    'A level curve must start at zero and contain 1-100 levels.');
  for (let index = 0; index < thresholds.length; index++) {
    integer(thresholds[index], 'Level threshold', 0, 1_000_000);
    requireRule(index === 0 || thresholds[index] > thresholds[index - 1], 'Level thresholds must strictly increase.');
  }
}

export function progression(xp: number, thresholds: readonly number[]): Progression {
  integer(xp, 'Experience', 0, 1_000_000);
  validCurve(thresholds);
  let level = 1;
  while (level < thresholds.length && xp >= thresholds[level]) level++;
  const nextThreshold = thresholds[level] ?? null;
  return { xp, level, nextThreshold, remaining: nextThreshold === null ? 0 : nextThreshold - xp };
}

export function gainExperience(xp: number, amount: number, thresholds: readonly number[]) {
  const before = progression(xp, thresholds);
  const after = progression(integer(xp + integer(amount, 'Experience gain', 0, 1_000_000),
    'Experience', 0, 1_000_000), thresholds);
  return { ...after, earnedLevels: after.level - before.level };
}
