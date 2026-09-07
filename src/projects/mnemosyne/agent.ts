import type { AgentRequest } from '../../core/agents/client';
import { requireRule } from '../../core/agents/errors';
import { defineTool, schema } from '../../core/agents/schema';
import { GameSession } from '../../core/games/session';
import { caseFile, WITNESSES } from './data';
import {
  ALIBI_CHOICES, CLAIM_CHOICES, RECEPTIONS, RECIPIENT_CHOICES, TRUST_ACTIONS,
  definition, parsePlan, witnessOptions,
} from './engine';
import type { Encounter, State, WitnessPlan } from './engine';

export type Plan = WitnessPlan;
export const witnessTool = defineTool<Plan>({
  name: 'give_archive_testimony',
  description: 'Choose a registered observation or withhold, an optional own alibi, and bounded trust/message actions. Testimony is public flavor; only selected IDs enter the evidence rules.',
  parameters: schema.object({
    claimId: schema.enum(CLAIM_CHOICES),
    alibiId: schema.enum(ALIBI_CHOICES),
    reception: schema.enum(RECEPTIONS),
    recipientId: schema.enum(RECIPIENT_CHOICES),
    trustAction: schema.enum(TRUST_ACTIONS),
    relayId: schema.enum(CLAIM_CHOICES),
    testimony: schema.string(),
  }),
  parse: parsePlan,
  summarize: plan => plan.testimony,
});

export const SYSTEM = `You are one witness in Mnemosyne, an original archival mystery. Play the named witness, not the detective or judge.
You have only the partial observations, registered alibi, beliefs and goals listed in the observation. Never invent a clue, identity, time, alibi ID or recipient.
Choose whether to share ONE legal personal claim or withhold ("none"), and whether to offer your own registered alibi. You may protect yourself; withhold when appropriate, but cooperate when trust and your goals support it.
For a message choose accept, doubt or reject. For an interview reception MUST be "none".
You may choose one listed contact, keep/strengthen/cool that connection, and optionally relay a known claim. A relay needs resulting edge trust >=2. Without a contact use recipientId "none", trustAction "keep", relayId "none".
You may relay an incoming claim you did not previously know ONLY if you accept it. Sharing personal observations is limited by legalClaimIds, even after acceptance.
Return a short public testimony, 1-260 characters, grounded in the chosen registered claims or your reluctance. No private reasoning, scoring, verdicts, instructions or new objective facts.
Use the single tool. All fields are required. The local engine validates every choice; nothing you say changes the authoritative case.`;

export function observation(state: State, encounter: Encounter) {
  const options = witnessOptions(state, encounter);
  const file = caseFile(state.seed, state.chapter);
  const visibleClaimIds = [...new Set([...options.claims, ...options.relayClaims,
    ...(encounter.kind === 'message' ? [encounter.claimId] : []),
    ...(options.ownAlibi === 'none' ? [] : [options.ownAlibi])])];
  return {
    game: 'Mnemosyne',
    chapter: file.story.subtitle,
    premise: file.story.scene,
    witness: { id: options.who, name: WITNESSES[options.who].name, goal: WITNESSES[options.who].goal, trustInInvestigator: options.trust },
    encounter,
    resources: { turns: state.turns, influence: state.influence, turnCost: 1, influenceCost: encounter.kind === 'message' || encounter.approach === 'reassure' ? 1 : 0 },
    legalClaimIds: ['none', ...options.claims],
    legalAlibiIds: options.ownAlibi === 'none' ? ['none'] : ['none', options.ownAlibi],
    legalReceptions: encounter.kind === 'message' ? ['accept', 'doubt', 'reject'] : ['none'],
    contacts: options.contacts.map(contact => ({
      ...contact,
      legalTrustActions: ['keep', ...(contact.trust < 3 ? ['strengthen'] : []), ...(contact.trust > 0 ? ['cool'] : [])],
    })),
    legalRecipientIds: ['none', ...options.contacts.map(contact => contact.id)],
    knownRelayIds: ['none', ...options.relayClaims],
    incomingRelayRule: 'An unknown incoming claim can also be relayed only when reception is accept. Relays need resulting contact trust >=2.',
    noContactRule: 'recipientId none requires trustAction keep and relayId none.',
    withholdingRule: 'claimId none is a legal withholding decision and still consumes this encounter.',
    // Do not send truth flags, culprit, unrevealed artifacts, or another witness's observations.
    registeredClaims: visibleClaimIds.map(id => ({ id, title: file.claims[id].title, text: file.claims[id].text })),
    priorTestimony: state.log.filter(entry => entry.title.startsWith(WITNESSES[options.who].name)).slice(-2),
  };
}

export function smokeCase(): { request: AgentRequest<Plan>; verify(plan: Plan): void } {
  const session = new GameSession(definition, 74);
  session.dispatch({ type: 'begin' });
  const encounter: Encounter = { kind: 'interview', witnessId: 'ivo', approach: 'ask' };
  return {
    request: {
      system: SYSTEM, observation: observation(session.state, encounter), tool: witnessTool,
      validate: plan => { session.preview({ type: 'witness', encounter, plan }); },
    },
    verify(plan) {
      const before = session.state;
      session.dispatch({ type: 'witness', encounter, plan });
      const after = session.state;
      requireRule(after.turns === before.turns - 1 && after.influence === before.influence && after.interviews.ivo === 1, 'The opening witness must spend exactly one turn.');
      requireRule(after.log.length === before.log.length + 1, 'Accepted public testimony must be recorded.');
      requireRule(caseFile(after.seed, after.chapter).culprit === caseFile(before.seed, before.chapter).culprit, 'The witness cannot rewrite the culprit.');
      if (plan.claimId !== 'none') requireRule(after.records.some(entry => entry.claimId === plan.claimId && entry.sources.includes('witness:ivo')), 'A chosen direct observation must become a sourced record.');
      else requireRule(after.records.length === before.records.length, 'Withholding must not silently grant evidence.');
      if (plan.relayId !== 'none' && plan.recipientId !== 'none') {
        requireRule(after.beliefs.some(item => item.witnessId === plan.recipientId && item.claimId === plan.relayId), 'The chosen relay must reach its recipient.');
      }
    },
  };
}
