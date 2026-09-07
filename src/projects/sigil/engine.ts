import { requireRule } from '../../core/agents/errors';
import { array, choice, integer, object, text } from '../../core/agents/schema';
import { GameSession } from '../../core/games/session';
import { CHALLENGE_IDS, CHAPTERS, DISCIPLINES, GLYPH_IDS, GLYPHS, HINT_IDS, challengeById } from './data';
import type { ChallengeId, Discipline, Glyph, HintId } from './data';
import { describeBeam } from './interpreter';
import { assess, legalProgram, limits, specimens, verifyConfiguration } from './solver';
import type { Assessment, Configuration } from './solver';

export interface Plan {
  action: 'commission' | 'hint';
  challengeId: ChallengeId;
  discipline: Discipline;
  hintId: HintId;
  intention: string;
}
export type Command =
  | { type: 'architect'; plan: Plan }
  | { type: 'inscribe'; glyph: Glyph; at: number }
  | { type: 'remove'; at: number }
  | { type: 'move'; from: number; to: number }
  | { type: 'clear' }
  | { type: 'compile' }
  | { type: 'surrender' };
export interface Attempt {
  challengeId: ChallengeId;
  program: Glyph[];
  matched: number;
  total: number;
  mistake: 'grammar' | 'timing' | 'color' | 'shape' | 'brightness' | 'gate' | 'none';
  witness: Assessment['witness'];
}
export interface Seal {
  config: Configuration;
  program: Glyph[];
  firings: number;
}
export interface State {
  seed: number;
  phase: 'awaiting' | 'working' | 'won' | 'lost';
  chapter: number;
  mana: number;
  hints: number;
  config: Configuration | null;
  program: Glyph[];
  firings: number;
  usedHints: HintId[];
  hint: string;
  intention: string;
  result: Assessment | null;
  attempts: Attempt[];
  seals: Seal[];
  ending: string;
}

export function parsePlan(value: unknown): Plan {
  const item = object(value, ['action', 'challengeId', 'discipline', 'hintId', 'intention'], 'Architect plan');
  return {
    action: choice(item.action, ['commission', 'hint'] as const, 'Architect action'),
    challengeId: choice(item.challengeId, CHALLENGE_IDS, 'Challenge'),
    discipline: choice(item.discipline, DISCIPLINES, 'Discipline'),
    hintId: choice(item.hintId, HINT_IDS, 'Hint'),
    intention: text(item.intention, 'Public intention', 180),
  };
}
export function parseCommand(value: unknown): Command {
  // Read the discriminant without permitting unchecked command properties.
  const probe = objectEnvelope(value);
  switch (probe) {
    case 'architect': {
      const item = object(value, ['type', 'plan']);
      return { type: 'architect', plan: parsePlan(item.plan) };
    }
    case 'inscribe': {
      const item = object(value, ['type', 'glyph', 'at']);
      return { type: 'inscribe', glyph: choice(item.glyph, GLYPH_IDS, 'Glyph'), at: integer(item.at, 'Socket', 0, 5) };
    }
    case 'remove': {
      const item = object(value, ['type', 'at']);
      return { type: 'remove', at: integer(item.at, 'Socket', 0, 5) };
    }
    case 'move': {
      const item = object(value, ['type', 'from', 'to']);
      return { type: 'move', from: integer(item.from, 'Source socket', 0, 5), to: integer(item.to, 'Target socket', 0, 5) };
    }
    default: object(value, ['type']); return { type: probe };
  }
}
function objectEnvelope(value: unknown): Command['type'] {
  requireRule(typeof value === 'object' && value !== null && !Array.isArray(value) && 'type' in value, 'A command needs a type.');
  return choice(value.type, ['architect', 'inscribe', 'remove', 'move', 'clear', 'compile', 'surrender'] as const, 'Command');
}
export function createState(seed: number): State {
  integer(seed, 'Edition seed', 0, 0xffffffff);
  return {
    seed, phase: 'awaiting', chapter: 0, mana: 14, hints: 3, config: null, program: [],
    firings: 0, usedHints: [], hint: '', intention: '', result: null, attempts: [], seals: [], ending: '',
  };
}
export function legalHints(state: State): HintId[] {
  if (state.phase !== 'working' || state.hints <= 0) return [];
  return (['principle', 'first-glyph', ...(state.result?.witness ? ['witness' as const] : [])] as HintId[])
    .filter(id => !state.usedHints.includes(id));
}
function hintText(state: State, id: HintId, solution: Glyph[]): string {
  requireRule(state.config, 'A hint needs an active commission.');
  if (id === 'principle') return challengeById(state.config.challengeId).principle;
  if (id === 'first-glyph') return `One shortest verified spell begins with ${GLYPHS[solution[0]].name}. That is one route, not the only accepted spelling.`;
  const witness = state.result?.witness;
  requireRule(id === 'witness' && witness, 'A witness hint needs an observed counterexample.');
  return `${witness.caseId}, tick ${witness.tick + 1}: expected ${describeBeam(witness.expected[witness.tick])}, received ${describeBeam(witness.actual[witness.tick])}. Inspect this tick and the previous tick; each memory tile stores its own input.`;
}
function mistake(result: Assessment, program: readonly Glyph[]): Attempt['mistake'] {
  if (result.syntax) return 'grammar';
  if (!result.witness) return 'none';
  const { actual, expected, tick } = result.witness;
  const a = actual[tick], b = expected[tick];
  if (!a || !b) return program.includes('delay') || program.includes('echo') ? 'timing' : 'gate';
  return a.hue !== b.hue ? 'color' : a.shape !== b.shape ? 'shape' : 'brightness';
}
export function reduce(state: State, raw: Command): State {
  const command = parseCommand(raw);
  if (command.type === 'architect') {
    const plan = command.plan;
    if (plan.action === 'commission') {
      requireRule(state.phase === 'awaiting', 'A commission is legal only between seals.');
      requireRule(plan.hintId === 'none', 'A commission must use hintId none.');
      const challenge = challengeById(plan.challengeId);
      requireRule(challenge.chapter === state.chapter, `Choose a challenge from chapter ${state.chapter + 1}.`);
      const config = { challengeId: plan.challengeId, discipline: plan.discipline };
      verifyConfiguration(config, state.seed);
      return {
        ...state, config, phase: 'working', program: [], firings: 0, usedHints: [], hint: '',
        intention: plan.intention, result: null,
      };
    }
    requireRule(state.phase === 'working' && state.config, 'Hints require an active, unsolved commission.');
    requireRule(plan.challengeId === state.config.challengeId && plan.discipline === state.config.discipline, 'A hint cannot change the current commission.');
    requireRule(legalHints(state).includes(plan.hintId), `Choose an unused legal hint: ${legalHints(state).join(', ')}.`);
    const solution = verifyConfiguration(state.config, state.seed);
    return {
      ...state, hints: state.hints - 1, usedHints: [...state.usedHints, plan.hintId],
      hint: hintText(state, plan.hintId, solution), intention: plan.intention,
    };
  }
  requireRule(state.phase === 'working' && state.config, 'The bench needs an active, unsolved commission.');
  if (command.type === 'surrender') return { ...state, phase: 'lost', ending: 'The unfinished seal was surrendered. Your earlier inscriptions remain in the ledger.' };
  if (command.type === 'compile') {
    requireRule(state.mana > 0 && state.firings < limits(state.config).firings, 'No firings remain.');
    legalProgram(state.program, state.config);
    const result = assess(state.program, specimens(state.config.challengeId, state.seed));
    const firings = state.firings + 1, mana = state.mana - 1;
    const attempt: Attempt = {
      challengeId: state.config.challengeId, program: [...state.program], matched: result.matched,
      total: result.total, mistake: mistake(result, state.program), witness: result.witness,
    };
    const next = { ...state, result, firings, mana, attempts: [...state.attempts, attempt] };
    if (result.passed) {
      const seals = [...state.seals, { config: state.config, program: [...state.program], firings }];
      const won = seals.length === CHAPTERS.length;
      if (!won && mana === 0) return { ...next, seals, phase: 'lost', ending: 'This seal is sound, but no mana remains to finish the remaining chapters.' };
      return {
        ...next, seals, chapter: won ? state.chapter : state.chapter + 1,
        phase: won ? 'won' : 'awaiting',
        ending: won ? 'All five seals hold. Your executable grammar has earned the master printer\'s mark.' : '',
      };
    }
    if (mana === 0 || firings >= limits(state.config).firings) return {
      ...next, phase: 'lost', ending: mana === 0 ? 'The last measure of mana is spent. The unfinished spell does not hold.' :
        'The plate has cooled: this seal used all its firings without a correct inscription.',
    };
    return next;
  }
  const program = [...state.program];
  if (command.type === 'inscribe') {
    requireRule(command.at <= program.length, 'Choose an existing socket or the next empty socket.');
    program.splice(command.at, 0, command.glyph);
  } else if (command.type === 'remove') {
    requireRule(command.at < program.length, 'There is no glyph in that socket.');
    program.splice(command.at, 1);
  } else if (command.type === 'move') {
    requireRule(command.from < program.length && command.to < program.length && command.from !== command.to, 'Choose two distinct occupied sockets.');
    const [glyph] = program.splice(command.from, 1);
    program.splice(command.to, 0, glyph);
  } else {
    requireRule(program.length > 0, 'The bench is already empty.');
    program.length = 0;
  }
  legalProgram(program, state.config);
  return { ...state, program, result: null };
}
export const definition = { id: 'sigil', create: createState, reduce, parseCommand };
export function createSession(seed = 77): GameSession<State, Command> { return new GameSession(definition, seed); }

export function parseProgram(value: unknown): Glyph[] {
  return array(value, entry => choice(entry, GLYPH_IDS, 'Glyph'), 'Program', 0, 6);
}
