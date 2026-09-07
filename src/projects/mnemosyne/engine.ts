import { AgentValidationError, requireRule } from '../../core/agents/errors';
import { array, choice, integer, object, text } from '../../core/agents/schema';
import type { GameDefinition } from '../../core/games/session';
import {
  ARTIFACT_IDS, CHAPTERS, CLAIM_IDS, CONNECTIONS, ROLES, ROUTES, SUSPECT_IDS, TIMES, WITNESS_IDS, WITNESSES, caseFile,
} from './data';
import type { ArtifactId, ClaimId, EvidenceRole, RouteId, SuspectId, TimeId, WitnessId } from './data';

export const CLAIM_CHOICES = ['none', ...CLAIM_IDS] as const;
export const RECIPIENT_CHOICES = ['none', ...WITNESS_IDS] as const;
export const ALIBI_CHOICES = ['none', 'alibi-ada', 'alibi-bram', 'alibi-cyra'] as const;
export const RECEPTIONS = ['none', 'accept', 'doubt', 'reject'] as const;
export const TRUST_ACTIONS = ['keep', 'strengthen', 'cool'] as const;

export interface WitnessPlan {
  claimId: typeof CLAIM_CHOICES[number];
  alibiId: typeof ALIBI_CHOICES[number];
  reception: typeof RECEPTIONS[number];
  recipientId: typeof RECIPIENT_CHOICES[number];
  trustAction: typeof TRUST_ACTIONS[number];
  relayId: typeof CLAIM_CHOICES[number];
  testimony: string;
}
export type Encounter =
  | { kind: 'interview'; witnessId: WitnessId; approach: 'ask' | 'reassure' }
  | { kind: 'message'; from: WitnessId; witnessId: WitnessId; claimId: ClaimId };
export interface EvidenceLink { role: EvidenceRole; claimId: ClaimId }
export type Command =
  | { type: 'begin' }
  | { type: 'witness'; encounter: Encounter; plan: WitnessPlan }
  | { type: 'inspect'; artifactId: ArtifactId }
  | { type: 'pin'; claimId: ClaimId }
  | { type: 'unpin'; claimId: ClaimId }
  | { type: 'accuse'; suspectId: SuspectId; route: RouteId; time: TimeId; links: EvidenceLink[]; reasoning: string }
  | { type: 'close' }
  | { type: 'next' };

export interface RecordEntry { claimId: ClaimId; sources: string[] }
export interface Belief { witnessId: WitnessId; claimId: ClaimId; origin: WitnessId }
export interface Edge { from: WitnessId; to: WitnessId; trust: number }
export interface MessageTrace { from: WitnessId; to: WitnessId; claimId: ClaimId; accepted: boolean }
export interface State {
  seed: number;
  chapter: number;
  phase: 'briefing' | 'investigation' | 'last-call' | 'won' | 'lost';
  turns: number;
  influence: number;
  trust: Record<WitnessId, number>;
  interviews: Record<WitnessId, number>;
  edges: Edge[];
  beliefs: Belief[];
  records: RecordEntry[];
  leads: ArtifactId[];
  inspected: ArtifactId[];
  pinned: ClaimId[];
  routed: string[];
  messages: MessageTrace[];
  log: { title: string; text: string }[];
  verdict: string;
  filing: Extract<Command, { type: 'accuse' }> | null;
}

export function parsePlan(value: unknown): WitnessPlan {
  const item = object(value, ['claimId', 'alibiId', 'reception', 'recipientId', 'trustAction', 'relayId', 'testimony'], 'Witness intent');
  return {
    claimId: choice(item.claimId, CLAIM_CHOICES, 'Claim'),
    alibiId: choice(item.alibiId, ALIBI_CHOICES, 'Alibi'),
    reception: choice(item.reception, RECEPTIONS, 'Reception'),
    recipientId: choice(item.recipientId, RECIPIENT_CHOICES, 'Recipient'),
    trustAction: choice(item.trustAction, TRUST_ACTIONS, 'Trust action'),
    relayId: choice(item.relayId, CLAIM_CHOICES, 'Relay'),
    testimony: text(item.testimony, 'Public testimony', 260),
  };
}

export function parseEncounter(value: unknown): Encounter {
  requireRule(typeof value === 'object' && value !== null && 'kind' in value, 'An encounter needs a kind.');
  if (value.kind === 'interview') {
    const item = object(value, ['kind', 'witnessId', 'approach'], 'Interview');
    return { kind: 'interview', witnessId: choice(item.witnessId, WITNESS_IDS, 'Witness'), approach: choice(item.approach, ['ask', 'reassure'] as const, 'Approach') };
  }
  const item = object(value, ['kind', 'from', 'witnessId', 'claimId'], 'Message');
  requireRule(item.kind === 'message', 'Unknown encounter.');
  return { kind: 'message', from: choice(item.from, WITNESS_IDS, 'Sender'), witnessId: choice(item.witnessId, WITNESS_IDS, 'Recipient'), claimId: choice(item.claimId, CLAIM_IDS, 'Message claim') };
}

export function parseCommand(value: unknown): Command {
  requireRule(typeof value === 'object' && value !== null && 'type' in value, 'A move needs a type.');
  switch (value.type) {
    case 'begin': case 'next': case 'close': {
      object(value, ['type']);
      return { type: value.type };
    }
    case 'witness': {
      const item = object(value, ['type', 'encounter', 'plan']);
      return { type: 'witness', encounter: parseEncounter(item.encounter), plan: parsePlan(item.plan) };
    }
    case 'inspect': {
      const item = object(value, ['type', 'artifactId']);
      return { type: 'inspect', artifactId: choice(item.artifactId, ARTIFACT_IDS, 'Artifact') };
    }
    case 'pin': case 'unpin': {
      const item = object(value, ['type', 'claimId']);
      return { type: value.type, claimId: choice(item.claimId, CLAIM_IDS, 'Claim') };
    }
    case 'accuse': {
      const item = object(value, ['type', 'suspectId', 'route', 'time', 'links', 'reasoning']);
      return {
        type: 'accuse', suspectId: choice(item.suspectId, SUSPECT_IDS, 'Suspect'),
        route: choice(item.route, ROUTES, 'Entry'), time: choice(item.time, TIMES, 'Time'),
        links: array(item.links, entry => {
          const link = object(entry, ['role', 'claimId'], 'Evidence link');
          return { role: choice(link.role, ROLES, 'Evidence role'), claimId: choice(link.claimId, CLAIM_IDS, 'Claim') };
        }, 'Evidence links', 3, 3),
        reasoning: text(item.reasoning, 'Reasoning', 500, 20),
      };
    }
    default: throw new AgentValidationError('Unknown Mnemosyne move.');
  }
}

function createChapter(seed: number, chapter: number): State {
  return {
    seed, chapter, phase: 'briefing', turns: 14, influence: 8,
    trust: { ivo: 2, nell: 1, ada: 1, bram: 1, cyra: 1 },
    interviews: { ivo: 0, nell: 0, ada: 0, bram: 0, cyra: 0 },
    edges: CONNECTIONS.map(([from, to, trust]) => ({ from, to, trust })),
    beliefs: WITNESS_IDS.map(witnessId => ({ witnessId, claimId: 'rumor', origin: 'ivo' })),
    records: [{ claimId: 'rumor', sources: ['town'] }],
    leads: [], inspected: [], pinned: [], routed: [], messages: [],
    log: [{ title: 'A town of incomplete memories', text: 'Testimony is a claim, not a fact. A physical record, or two independent observers, can corroborate it. A forwarded story is still only one source.' }],
    verdict: '', filing: null,
  };
}

export function create(seed: number): State {
  return createChapter(integer(seed, 'Seed', 0, 0xffffffff), 0);
}

export function edgeBetween(state: State, a: WitnessId, b: WitnessId): Edge | undefined {
  return state.edges.find(edge => (edge.from === a && edge.to === b) || (edge.from === b && edge.to === a));
}
export function corroborated(state: State, claimId: ClaimId): boolean {
  const sources = state.records.find(entry => entry.claimId === claimId)?.sources ?? [];
  return sources.some(source => source.startsWith('artifact:')) || sources.filter(source => source.startsWith('witness:')).length >= 2;
}
export function inspectionCost(state: State, artifactId: ArtifactId) {
  if (state.inspected.includes(artifactId)) return { turns: 0, influence: 0 };
  return state.leads.includes(artifactId) ? { turns: 1, influence: 0 } : { turns: 3, influence: 2 };
}
export function canInvestigate(state: State): boolean { return state.phase === 'investigation'; }
function active(state: State) {
  requireRule(state.phase === 'investigation' || state.phase === 'last-call', 'This inquiry is not open.');
}
function pay(state: State, turns: number, influence: number) {
  requireRule(canInvestigate(state), 'No investigation turns remain.');
  requireRule(state.turns >= turns && state.influence >= influence, `This action needs ${turns} turn(s) and ${influence} influence.`);
  state.turns -= turns;
  state.influence -= influence;
}
function finishTurn(state: State) {
  if (state.turns > 0) return;
  if (['imprint', 'passage', 'minute'].every(id => state.records.some(entry => entry.claimId === id) &&
      corroborated(state, choice(id, CLAIM_IDS, 'Claim')))) {
    state.phase = 'last-call';
    state.log.push({ title: 'The last bell', text: 'Your investigation time is over. Review and pin your existing records freely, then file your accusation. No new evidence can be collected.' });
  } else {
    state.phase = 'lost';
    state.verdict = 'Ran out of leads. Dawn sealed the archive before identity, entry, and time could be corroborated. Next time, preserve six influence and nine turns for three independent warrants if witnesses will not help.';
  }
}
function addRecord(state: State, claimId: ClaimId, source: string) {
  let entry = state.records.find(record => record.claimId === claimId);
  if (!entry) {
    entry = { claimId, sources: [] };
    state.records.push(entry);
  }
  if (!entry.sources.includes(source)) entry.sources.push(source);
}
function locate(state: State, claimId: ClaimId) {
  const artifact = caseFile(state.seed, state.chapter).artifacts.find(item => item.claimId === claimId);
  if (artifact && !state.leads.includes(artifact.id)) state.leads.push(artifact.id);
}
function belief(state: State, who: WitnessId, claimId: ClaimId, origin: WitnessId) {
  if (!state.beliefs.some(item => item.witnessId === who && item.claimId === claimId)) {
    state.beliefs.push({ witnessId: who, claimId, origin });
  }
  const file = caseFile(state.seed, state.chapter);
  if (file.artifacts.some(item => item.custodian === who && item.claimId === claimId)) locate(state, claimId);
}
function knownBy(state: State, who: WitnessId): ClaimId[] {
  const file = caseFile(state.seed, state.chapter);
  return [...new Set([
    ...file.knowledge[who].map(item => item.claimId),
    ...state.beliefs.filter(item => item.witnessId === who).map(item => item.claimId),
  ])];
}
export function routableClaims(state: State, who: WitnessId): ClaimId[] {
  return knownBy(state, who).filter(id => state.records.some(item => item.claimId === id));
}
function routeKey(encounter: Extract<Encounter, { kind: 'message' }>) {
  return `${encounter.from}:${encounter.witnessId}:${encounter.claimId}`;
}
export function assertEncounter(state: State, encounter: Encounter): void {
  requireRule(canInvestigate(state), 'Open the case and keep at least one investigation turn.');
  const cost = encounter.kind === 'message' || encounter.approach === 'reassure' ? 1 : 0;
  requireRule(state.turns >= 1 && state.influence >= cost, 'Not enough time or influence for this encounter.');
  if (encounter.kind === 'interview') {
    requireRule(state.interviews[encounter.witnessId] < 3, 'This witness has given three interviews. Revisit their records for free, or seek a physical warrant.');
  } else {
    requireRule(Boolean(edgeBetween(state, encounter.from, encounter.witnessId)), 'Messages can travel only along a drawn trust connection.');
    requireRule(routableClaims(state, encounter.from).includes(encounter.claimId), 'The sender must know a claim that is already in your notebook.');
    requireRule(!state.routed.includes(routeKey(encounter)), 'This exact message has already been delivered. Forwarding it again would not add a source.');
  }
}

export function witnessOptions(state: State, encounter: Encounter) {
  assertEncounter(state, encounter);
  const file = caseFile(state.seed, state.chapter);
  const who = encounter.witnessId;
  const trust = Math.min(3, state.trust[who] + (encounter.kind === 'interview' && encounter.approach === 'reassure' ? 1 : 0));
  const claims = file.knowledge[who].filter(item => item.trust <= trust).map(item => item.claimId);
  const ownAlibi = ALIBI_CHOICES.find(id => id === `alibi-${who}`) ?? 'none';
  const contacts = state.edges.filter(edge => edge.from === who || edge.to === who).map(edge => ({
    id: edge.from === who ? edge.to : edge.from, trust: edge.trust,
  }));
  return { who, trust, claims, ownAlibi, contacts, relayClaims: knownBy(state, who) };
}

function witnessTurn(state: State, encounter: Encounter, plan: WitnessPlan) {
  const options = witnessOptions(state, encounter);
  const who = encounter.witnessId;
  requireRule(plan.claimId === 'none' || options.claims.includes(plan.claimId), 'A witness may share only a listed personal observation at the current trust level.');
  requireRule(plan.alibiId === 'none' || plan.alibiId === options.ownAlibi, 'Only this witness\'s own registered alibi is legal.');
  requireRule(encounter.kind === 'message' ? plan.reception !== 'none' : plan.reception === 'none', 'Choose a reception only for an incoming message.');
  if (plan.recipientId === 'none') {
    requireRule(plan.trustAction === 'keep' && plan.relayId === 'none', 'Without a recipient, keep trust and do not relay.');
  } else {
    const contact = options.contacts.find(item => item.id === plan.recipientId);
    requireRule(Boolean(contact), 'Choose a contact on this witness\'s trust network.');
    requireRule(plan.trustAction !== 'strengthen' || contact!.trust < 3, 'This connection is already at maximum trust.');
    requireRule(plan.trustAction !== 'cool' || contact!.trust > 0, 'This connection is already at minimum trust.');
    if (plan.relayId !== 'none') {
      const incoming = encounter.kind === 'message' && plan.reception === 'accept' && encounter.claimId === plan.relayId;
      requireRule(options.relayClaims.includes(plan.relayId) || incoming, 'A witness cannot relay an unknown claim or a rejected incoming message.');
      requireRule(contact!.trust + (plan.trustAction === 'strengthen' ? 1 : plan.trustAction === 'cool' ? -1 : 0) >= 2,
        'A relay needs connection trust of at least two after the chosen trust action.');
    }
  }
  pay(state, 1, encounter.kind === 'message' || encounter.approach === 'reassure' ? 1 : 0);
  state.trust[who] = options.trust;
  if (encounter.kind === 'interview') state.interviews[who]++;
  else {
    state.routed.push(routeKey(encounter));
    if (plan.reception === 'accept') {
      belief(state, who, encounter.claimId, encounter.from);
      state.trust[who] = Math.min(3, state.trust[who] + 1);
    } else if (plan.reception === 'reject') {
      state.trust[who] = Math.max(0, state.trust[who] - 1);
      state.beliefs = state.beliefs.filter(item => item.witnessId !== who || item.claimId !== encounter.claimId);
    }
    state.messages.push({ from: encounter.from, to: who, claimId: encounter.claimId, accepted: plan.reception === 'accept' });
  }
  if (plan.claimId !== 'none') {
    addRecord(state, plan.claimId, `witness:${who}`);
    locate(state, plan.claimId);
  }
  if (plan.alibiId !== 'none') addRecord(state, plan.alibiId, `witness:${who}`);
  if (plan.recipientId !== 'none') {
    const edge = edgeBetween(state, who, plan.recipientId)!;
    edge.trust += plan.trustAction === 'strengthen' ? 1 : plan.trustAction === 'cool' ? -1 : 0;
    if (plan.relayId !== 'none') {
      belief(state, plan.recipientId, plan.relayId, who);
      state.messages.push({ from: who, to: plan.recipientId, claimId: plan.relayId, accepted: true });
    }
  }
  const file = caseFile(state.seed, state.chapter);
  const actions = [
    plan.claimId === 'none' ? 'Withheld personal observations.' : `Recorded: ${file.claims[plan.claimId].title}.`,
    plan.alibiId === 'none' ? '' : `Offered ${file.claims[plan.alibiId].title}.`,
    encounter.kind === 'message' ? `Incoming message: ${plan.reception}.` : '',
    plan.recipientId === 'none' ? '' : `${WITNESSES[plan.recipientId].name}: ${plan.trustAction} trust${plan.relayId === 'none' ? '' : `; relayed ${file.claims[plan.relayId].title}`}.`,
  ].filter(Boolean).join(' ');
  state.log.push({ title: `${WITNESSES[who].name} / ${encounter.kind}`, text: `${plan.testimony}\n${actions}` });
  finishTurn(state);
}

export function reduce(previous: State, command: Command): State {
  const state = structuredClone(previous);
  const file = caseFile(state.seed, state.chapter);
  switch (command.type) {
    case 'begin':
      requireRule(state.phase === 'briefing', 'This case is already open.');
      state.phase = 'investigation';
      return state;
    case 'next':
      requireRule(state.phase === 'won' && state.chapter + 1 < CHAPTERS.length, 'Solve this chapter before opening the next.');
      return createChapter(state.seed, state.chapter + 1);
    case 'witness':
      witnessTurn(state, command.encounter, command.plan);
      return state;
    case 'inspect': {
      // A known exhibit can be revisited even after the verdict without spending resources.
      if (state.inspected.includes(command.artifactId)) return state;
      const cost = inspectionCost(state, command.artifactId);
      pay(state, cost.turns, cost.influence);
      const artifact = file.artifacts.find(item => item.id === command.artifactId);
      requireRule(Boolean(artifact), 'Unknown artifact.');
      state.inspected.push(command.artifactId);
      locate(state, artifact!.claimId);
      addRecord(state, artifact!.claimId, `artifact:${command.artifactId}`);
      state.log.push({ title: artifact!.title, text: `${cost.turns === 3 ? 'Warrant search' : 'Located exhibit'}: ${artifact!.detail}` });
      finishTurn(state);
      return state;
    }
    case 'pin': case 'unpin':
      active(state);
      requireRule(state.records.some(entry => entry.claimId === command.claimId), 'Unknown evidence cannot be pinned.');
      if (command.type === 'pin' && !state.pinned.includes(command.claimId)) state.pinned.push(command.claimId);
      if (command.type === 'unpin') state.pinned = state.pinned.filter(id => id !== command.claimId);
      return state;
    case 'accuse': {
      active(state);
      requireRule(new Set(command.links.map(link => link.role)).size === 3, 'Link one pinned claim to each of identity, entry, and time.');
      requireRule(new Set(command.links.map(link => link.claimId)).size === 3, 'Three distinct claims are required; one story cannot fill every gap.');
      requireRule(command.links.every(link => state.pinned.includes(link.claimId)), 'Every cited claim must first be discovered and pinned.');
      const supported = command.links.every(link => {
        const claim = file.claims[link.claimId];
        return claim.true && claim.role === link.role && corroborated(state, claim.id) && claim.supports.includes(command.suspectId);
      });
      const correct = supported && command.suspectId === file.culprit && command.route === file.route && command.time === file.time;
      state.phase = correct ? 'won' : 'lost';
      state.filing = structuredClone(command);
      state.verdict = correct ? `Case sustained. ${WITNESSES[file.culprit].name} used the ${file.route} at ${file.time}. Identity, entry, and time are independently supported. ${file.story.aftermath}` :
        `Accusation failed. ${supported ? 'The route or corrected minute does not match the record.' : 'The cited record does not independently support this suspect in all three roles.'} The archive cannot convict on repetition or confidence. The supported reconstruction is ${WITNESSES[file.culprit].name}, ${file.route}, ${file.time}.`;
      state.log.push({ title: correct ? 'The record holds' : 'An unsupported accusation', text: `${command.reasoning}\n${state.verdict}` });
      return state;
    }
    case 'close':
      active(state);
      state.phase = 'lost';
      state.verdict = 'Investigation closed unresolved. The town keeps its rumors; the archive keeps its silence. A physical warrant is always available while you can still afford it.';
      return state;
  }
}

export const definition: GameDefinition<State, Command> = { id: 'mnemosyne', create, reduce, parseCommand };
