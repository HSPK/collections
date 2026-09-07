import type { AgentRequest } from '../../core/agents/client';
import { requireRule } from '../../core/agents/errors';
import { defineTool, schema } from '../../core/agents/schema';
import { CHALLENGES, CHALLENGE_IDS, CHAPTERS, DISCIPLINES, GLYPHS, HINT_IDS, challengeById } from './data';
import { createSession, legalHints, parsePlan } from './engine';
import type { Plan, State } from './engine';
import { limits, verifyConfiguration } from './solver';

export type { Plan } from './engine';
export const architectTool = defineTool<Plan>({
  name: 'engrave_commission',
  description: 'Choose a solver-verified Sigil commission and restriction, or one bounded hint. The local interpreter alone judges success.',
  parameters: schema.object({
    action: schema.enum(['commission', 'hint']),
    challengeId: schema.enum(CHALLENGE_IDS),
    discipline: schema.enum(DISCIPLINES),
    hintId: schema.enum(HINT_IDS),
    intention: schema.string(),
  }),
  parse: parsePlan,
  summarize: plan => `${plan.action === 'commission' ? challengeById(plan.challengeId).name : `Hint: ${plan.hintId}`} / ${plan.intention}`,
});

export const SYSTEM = `You are the Architect of Sigil, an exacting but helpful printer of executable light.
You choose the next mechanical exercise, its workbench restriction, or a bounded teaching hint.
Use only legalChoices in the observation. Every configuration was solved locally before being offered and is solved again before commitment.
Adapt to observed mistakes: prefer roomy discipline after misses, the alternative exercise that teaches a weak skill, and precise after clean successes.
Choose a hint that addresses the latest failed behavior; never return a program or invent a hint in prose.
For commission use action commission, hintId none, and one offered challengeId/discipline pair.
For hint use action hint, the current challengeId/discipline unchanged, and one offered hintId.
Public intention is one English sentence, at most 180 characters, explaining your pedagogical choice, not private reasoning.
No score, success declaration, invented rule, URL, code, or unlisted configuration. Light order is left to right; time is a six-tick stream.
There are five chapters, 14 total firings of mana and 3 hint slips. API failures never spend game resources.
Your role is required for new commissions and hints. The player alone constructs and executes the spell.`;

export function observation(state: State, action: Plan['action']) {
  const legalChoices = action === 'commission'
    ? CHALLENGES.filter(item => item.chapter === state.chapter).flatMap(item => DISCIPLINES.map(discipline => {
      const config = { challengeId: item.id, discipline };
      const solution = verifyConfiguration(config, state.seed);
      return {
        action: 'commission', ...config, hintId: 'none', name: item.name, goal: item.goal,
        palette: item.palette, ...limits(config), solverVerified: true, shortestLength: solution.length,
      };
    }))
    : legalHints(state).map(hintId => ({
      action: 'hint', challengeId: state.config?.challengeId, discipline: state.config?.discipline, hintId,
      effect: hintId === 'principle' ? 'One authored rule-order insight.' :
        hintId === 'first-glyph' ? 'Only the first glyph of one shortest solved program.' : 'One observed mismatch, explained literally.',
    }));
  return {
    game: 'Sigil', action, phase: state.phase, chapter: state.chapter + 1,
    lesson: CHAPTERS[state.chapter].lesson, mana: state.mana, hints: state.hints,
    current: state.config ? {
      ...state.config, program: state.program, firingsSpent: state.firings,
      limits: limits(state.config), usedHints: state.usedHints,
    } : null,
    observedMistakes: state.attempts.slice(-8),
    earnedSeals: state.seals.map(seal => ({ challengeId: seal.config.challengeId, firings: seal.firings })),
    legalChoices,
    grammar: Object.fromEntries(Object.entries(GLYPHS).map(([id, glyph]) => [id, { rule: glyph.rule, brass: glyph.cost }])),
    constraints: { intentionCharacters: 180, playerSuccess: 'Local execution against 3 open and 42 sealed six-tick specimens, never model judgment.' },
  };
}

export function smokeCase(): { request: AgentRequest<Plan>; verify(plan: Plan): void } {
  const session = createSession(77);
  return {
    request: {
      system: SYSTEM, observation: observation(session.state, 'commission'), tool: architectTool,
      validate: plan => { session.preview({ type: 'architect', plan }); },
    },
    verify(plan) {
      const revision = session.revision;
      session.dispatch({ type: 'architect', plan });
      requireRule(session.revision === revision + 1 && session.state.phase === 'working' && session.state.config,
        'The opening architect turn did not commit a real commission.');
      const solution = verifyConfiguration(session.state.config, session.seed);
      requireRule(solution.length >= 2 && session.state.mana === 14 && session.state.hints === 3,
        'The opening commission must be meaningful and must not spend player resources.');
    },
  };
}
