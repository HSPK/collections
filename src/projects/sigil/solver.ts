import { requireRule } from '../../core/agents/errors';
import { challengeById } from './data';
import type { Beam, ChallengeId, Discipline, Glyph } from './data';
import { equalBeam, execute, programCost, pulse, syntaxError } from './interpreter';

export interface Configuration { challengeId: ChallengeId; discipline: Discipline }
export interface Specimen { id: string; heldOut: boolean; input: Beam[]; expected: Beam[] }
export interface Limits { slots: number; capacity: number; firings: number }
export interface Counterexample { caseId: string; tick: number; heldOut: boolean; input: Beam[]; expected: Beam[]; actual: Beam[] }
export interface Assessment { passed: boolean; matched: number; total: number; syntax: string | null; witness: Counterexample | null }

export function limits(config: Configuration): Limits {
  const target = challengeById(config.challengeId).target;
  const roomy = config.discipline === 'roomy';
  return {
    slots: Math.min(6, target.length + (roomy ? 1 : 0)),
    capacity: programCost(target) + (roomy ? 2 : 0),
    firings: roomy ? 5 : 4,
  };
}

export function specimens(id: ChallengeId, seed: number): Specimen[] {
  const challenge = challengeById(id);
  const inputs: Beam[][] = [
    [pulse(0, 0), pulse(1, 1, 2), pulse(2, 2), null, pulse(0, 2, 2), null],
    [pulse(2, 1, 2), null, null, pulse(1, 2), pulse(0, 1), pulse(2, 0, 2)],
    [null, pulse(0, 2), pulse(1, 0, 2), pulse(2, 1), null, pulse(1, 2, 2)],
  ];
  // Every color/shape/brightness combination, plus history-rich seeded sequences.
  for (let hue = 0; hue < 3; hue++) for (let shape = 0; shape < 3; shape++) for (let light = 1; light <= 2; light++) {
    inputs.push([null, pulse(hue, shape, light), null, null, pulse((hue + 1) % 3, (shape + 2) % 3, 3 - light), null]);
  }
  let random = (seed ^ 0x51a17e) >>> 0;
  const draw = () => { random = (Math.imul(random, 1664525) + 1013904223) >>> 0; return random; };
  for (let sample = 0; sample < 24; sample++) {
    inputs.push(Array.from({ length: 6 }, () => {
      const n = draw();
      return n % 5 === 0 ? null : pulse((n >>> 8) % 3, (n >>> 16) % 3, 1 + ((n >>> 24) % 2));
    }));
  }
  return inputs.map((input, index) => ({
    id: index < 3 ? `specimen-${index + 1}` : `sealed-${index - 2}`,
    heldOut: index >= 3, input, expected: execute(challenge.target, input, false).output,
  }));
}

export function assess(program: readonly Glyph[], cases: readonly Specimen[]): Assessment {
  const syntax = syntaxError(program);
  if (syntax) return { passed: false, matched: 0, total: cases.length, syntax, witness: null };
  let matched = 0, witness: Counterexample | null = null;
  for (const item of cases) {
    const actual = execute(program, item.input, false).output;
    const tick = actual.findIndex((beam, index) => !equalBeam(beam, item.expected[index]));
    if (tick < 0) matched++;
    else if (!witness) witness = {
      caseId: item.id, tick, heldOut: item.heldOut, input: item.input, expected: item.expected, actual,
    };
  }
  return { passed: matched === cases.length, matched, total: cases.length, syntax: null, witness };
}

export function legalProgram(program: readonly Glyph[], config: Configuration): void {
  const challenge = challengeById(config.challengeId), budget = limits(config);
  requireRule(program.length <= budget.slots, `This bench has ${budget.slots} sockets.`);
  requireRule(program.every(glyph => challenge.palette.includes(glyph)), 'A glyph is outside this commission palette.');
  requireRule(programCost(program) <= budget.capacity, `This bench can hold ${budget.capacity} brass units.`);
}

// Breadth by length, bounded depth-first within each layer. No generated code or model answers.
export function solve(config: Configuration, seed = 1): Glyph[] | null {
  const challenge = challengeById(config.challengeId), budget = limits(config);
  const cases = specimens(challenge.id, seed);
  const candidate: Glyph[] = [];
  function search(remaining: number, cost: number, open: boolean): Glyph[] | null {
    if (!remaining) {
      if (open) return null;
      for (const item of cases) {
        const out = execute(candidate, item.input, false).output;
        if (out.some((beam, index) => !equalBeam(beam, item.expected[index]))) return null;
      }
      return [...candidate];
    }
    for (const glyph of challenge.palette) {
      if ((glyph === 'fork' && open) || (glyph === 'weave' && !open)) continue;
      const nextCost = cost + programCost([glyph]);
      if (nextCost > budget.capacity) continue;
      candidate.push(glyph);
      const result = search(remaining - 1, nextCost, glyph === 'fork' ? true : glyph === 'weave' ? false : open);
      candidate.pop();
      if (result) return result;
    }
    return null;
  }
  for (let length = 0; length <= budget.slots; length++) {
    const result = search(length, 0, false);
    if (result) return result;
  }
  return null;
}

export function verifyConfiguration(config: Configuration, seed: number): Glyph[] {
  const solution = solve(config, seed);
  requireRule(solution !== null && solution.length >= 2, 'This configuration must have a nontrivial, solver-verified solution.');
  legalProgram(solution, config);
  requireRule(assess(solution, specimens(config.challengeId, seed)).passed, 'The solver certificate did not pass the complete suite.');
  return solution;
}
