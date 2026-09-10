import { requireRule } from '../agents/errors';

export class FixedStepClock {
  readonly stepMs: number;
  readonly maxSteps: number;
  private remainder = 0;

  constructor(stepMs = 1000 / 60, maxSteps = 6) {
    requireRule(Number.isFinite(stepMs) && stepMs > 0 && stepMs <= 1000, 'Invalid simulation step.');
    requireRule(Number.isInteger(maxSteps) && maxSteps >= 1 && maxSteps <= 60, 'Invalid catch-up budget.');
    this.stepMs = stepMs;
    this.maxSteps = maxSteps;
  }

  advance(deltaMs: number, step: () => void): number {
    requireRule(Number.isFinite(deltaMs) && deltaMs >= 0, 'Invalid frame duration.');
    // Under a long stall, slow the simulation rather than skipping unseen gameplay.
    this.remainder += Math.min(deltaMs, this.stepMs * this.maxSteps);
    let count = 0;
    while (this.remainder + 1e-8 >= this.stepMs && count < this.maxSteps) {
      this.remainder = Math.max(0, this.remainder - this.stepMs);
      step();
      count++;
    }
    return count;
  }

  reset(): void { this.remainder = 0; }
}
