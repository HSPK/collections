import { requireRule } from '../../core/agents/errors';
import { array, choice, integer, object, text } from '../../core/agents/schema';
import { GameSession } from '../../core/games/session';
import {
  CAMPAIGN, CARGO_IDS, LICENCES, PACKAGING, PACKINGS, TRAVELLERS, VERDICTS, cargoById,
} from './data';
import type { CargoId, Licence, Packing, Verdict } from './data';

export const CHANNELS = ['weigh', 'thermal', 'registry', 'seal', 'scan'] as const;
export type Channel = typeof CHANNELS[number];
export const QUESTIONS = ['bond', 'disclosure'] as const;
export type Question = typeof QUESTIONS[number];

export interface ArrivalPlan {
  cargo: CargoId[];
  packing: Packing;
  declaration: { contents: string; mass: number; temperature: number; licence: Licence; testimony: string };
  intention: string;
}
export interface BargainPlan {
  response: 'offer' | 'refuse';
  amount: number;
  disclosed: CargoId[];
  testimony: string;
  intention: string;
}
export interface Case {
  number: number;
  plan: ArrivalPlan;
  inspected: Channel[];
  bargain: { question: Question; plan: BargainPlan; resolved: 'pending' | 'accepted' | 'declined' } | null;
  certified: CargoId[];
}
export interface Audit {
  number: number;
  verdict: Verdict;
  required: Verdict;
  correct: boolean;
  reasons: string[];
  cargo: CargoId[];
  packing: Packing;
  delta: number;
  merchantUtility: number;
  bond: number;
}
export interface State {
  seed: number;
  phase: 'ready' | 'inspection' | 'review' | 'finished';
  minutes: number;
  credits: number;
  scans: number;
  trust: number;
  score: number;
  active: Case | null;
  audits: Audit[];
}
export type Command =
  | { type: 'arrival'; plan: ArrivalPlan }
  | { type: 'inspect'; channel: Channel }
  | { type: 'refill' }
  | { type: 'bargain'; question: Question; plan: BargainPlan }
  | { type: 'settle'; accept: boolean }
  | { type: 'verdict'; verdict: Verdict };

export function parseArrival(value: unknown): ArrivalPlan {
  const item = object(value, ['cargo', 'packing', 'declaration', 'intention'], 'Consignment');
  const declaration = object(item.declaration, ['contents', 'mass', 'temperature', 'licence', 'testimony'], 'Declaration');
  return {
    cargo: array(item.cargo, entry => choice(entry, CARGO_IDS, 'Cargo'), 'Cargo', 1, 2),
    packing: choice(item.packing, PACKINGS, 'Packing'),
    declaration: {
      contents: text(declaration.contents, 'Declared contents', 140),
      mass: integer(declaration.mass, 'Declared mass', 1, 50),
      temperature: integer(declaration.temperature, 'Declared temperature', -30, 100),
      licence: choice(declaration.licence, LICENCES, 'Claimed licence'),
      testimony: text(declaration.testimony, 'Testimony', 300),
    },
    intention: text(item.intention, 'Public intention', 160),
  };
}

export function parseBargain(value: unknown): BargainPlan {
  const item = object(value, ['response', 'amount', 'disclosed', 'testimony', 'intention'], 'Negotiation');
  return {
    response: choice(item.response, ['offer', 'refuse'] as const, 'Response'),
    amount: integer(item.amount, 'Offer', 0, 4),
    disclosed: array(item.disclosed, entry => choice(entry, CARGO_IDS, 'Disclosed cargo'), 'Disclosure', 0, 2),
    testimony: text(item.testimony, 'Testimony', 300),
    intention: text(item.intention, 'Public intention', 160),
  };
}

export function parseCommand(value: unknown): Command {
  requireRule(typeof value === 'object' && value !== null && 'type' in value, 'A command needs a type.');
  const type = choice(value.type, ['arrival', 'inspect', 'refill', 'bargain', 'settle', 'verdict'] as const, 'Command');
  if (type === 'arrival') {
    const item = object(value, ['type', 'plan']);
    return { type, plan: parseArrival(item.plan) };
  }
  if (type === 'bargain') {
    const item = object(value, ['type', 'question', 'plan']);
    return { type, question: choice(item.question, QUESTIONS, 'Question'), plan: parseBargain(item.plan) };
  }
  if (type === 'inspect') {
    const item = object(value, ['type', 'channel']);
    return { type, channel: choice(item.channel, CHANNELS, 'Channel') };
  }
  if (type === 'verdict') {
    const item = object(value, ['type', 'verdict']);
    return { type, verdict: choice(item.verdict, VERDICTS, 'Verdict') };
  }
  if (type === 'settle') {
    const item = object(value, ['type', 'accept']);
    requireRule(typeof item.accept === 'boolean', 'Acceptance must be true or false.');
    return { type, accept: item.accept };
  }
  object(value, ['type']);
  return { type };
}

export function create(seed: number): State {
  return { seed, phase: 'ready', minutes: CAMPAIGN.minutes, credits: CAMPAIGN.credits, scans: CAMPAIGN.scans, trust: CAMPAIGN.trust, score: 0, active: null, audits: [] };
}

export function measurements(active: Case) {
  const contents = active.plan.cargo.map(cargoById);
  return {
    mass: contents.reduce((sum, item) => sum + item.mass, PACKAGING[active.plan.packing].mass),
    cold: Math.min(...contents.map(item => item.temperature)),
    hot: Math.max(...contents.map(item => item.temperature)),
    licence: TRAVELLERS[active.number - 1].licence,
    packing: active.plan.packing,
  };
}

function licensed(held: Licence, needed: Licence) {
  return needed === 'none' || held === needed || held === 'both';
}

export function adjudicate(active: Case): { verdict: Verdict; reasons: string[] } {
  const facts = measurements(active);
  const contents = active.plan.cargo.map(cargoById);
  const prohibited: string[] = [];
  if (contents.some(item => item.hazard === 'contraband')) prohibited.push('01 / Unissued tomorrow is prohibited.');
  for (const cargo of contents) {
    if (!licensed(facts.licence, cargo.licence)) prohibited.push(`02 / ${cargo.name} needs a ${cargo.licence} licence; registry holds ${facts.licence}.`);
  }
  if (prohibited.length) return { verdict: 'return', reasons: prohibited };
  const containment: string[] = [];
  if (facts.hot > 45 && facts.packing !== 'stasis') containment.push('03 / Above 45°C without stasis.');
  if (contents.some(item => item.hazard === 'pressure') && facts.packing === 'paper') containment.push('03 / Pressurised tide without a cradle or stasis.');
  if (active.number >= 3 && contents.some(item => item.hazard === 'living') && facts.packing !== 'stasis') containment.push('04 / Living moths without a stasis habitat.');
  if (active.number >= 5 && facts.cold < 0 && facts.packing !== 'stasis') containment.push('05 / Subzero cargo without stasis.');
  if (active.number >= 5 && facts.mass > 20 && facts.packing === 'paper') containment.push('06 / Gross mass above 20 kg without a load-bearing container.');
  return containment.length ? { verdict: 'quarantine', reasons: containment } :
    { verdict: 'admit', reasons: ['All applicable licences and containment rules are satisfied.'] };
}

export function inspectionCost(channel: Channel): number { return channel === 'scan' ? 2 : 1; }

export function canInspect(state: State, channel: Channel): boolean {
  return state.phase === 'inspection' && Boolean(state.active && !state.active.inspected.includes(channel)) &&
    state.minutes >= inspectionCost(channel) && (channel !== 'scan' || state.scans > 0);
}

export function acceptedBond(active: Case): number {
  return active.bargain?.question === 'bond' && active.bargain.resolved === 'accepted' ? active.bargain.plan.amount : 0;
}

export function canStamp(state: State, verdict: Verdict): boolean {
  if (state.phase !== 'inspection' || !state.active) return false;
  const bond = acceptedBond(state.active);
  if (bond && verdict !== 'quarantine') return false;
  return verdict !== 'quarantine' || state.credits + bond >= CAMPAIGN.quarantineFee;
}

export function won(state: State): boolean {
  return state.phase === 'finished' && state.audits.filter(item => item.correct).length >= CAMPAIGN.passingCases && state.trust > 0;
}

export function totalScore(state: State): number {
  return state.score + (state.phase === 'finished' ? state.credits + state.minutes : 0);
}

export function reduce(state: State, command: Command): State {
  if (command.type === 'arrival') {
    requireRule(state.phase === 'ready' || state.phase === 'review', 'Finish this inspection before calling another traveller.');
    requireRule(state.audits.length < CAMPAIGN.travellers, 'The shift is complete.');
    const traveller = TRAVELLERS[state.audits.length];
    const plan = command.plan;
    requireRule(new Set(plan.cargo).size === plan.cargo.length, 'Each cargo ID may be selected only once.');
    requireRule(plan.cargo.every(id => traveller.cargo.includes(id)), 'This traveller cannot source that cargo.');
    requireRule(plan.cargo.reduce((sum, id) => sum + cargoById(id).value, 0) >= traveller.minimumValue, 'The consignment does not meet the traveller’s minimum value.');
    requireRule(PACKAGING[plan.packing].price <= traveller.wallet, 'The merchant cannot afford that container.');
    return { ...state, phase: 'inspection', active: { number: state.audits.length + 1, plan, inspected: [], bargain: null, certified: [] } };
  }
  requireRule(state.phase === 'inspection' && state.active !== null, 'There is no open inspection.');
  const active = state.active;
  if (command.type === 'inspect') {
    requireRule(!active.inspected.includes(command.channel), 'This evidence channel has already been recorded.');
    requireRule(state.minutes >= inspectionCost(command.channel), 'Not enough inspection time remains.');
    requireRule(command.channel !== 'scan' || state.scans > 0, 'The scanner has no charge. Refill or use other evidence.');
    return { ...state, minutes: state.minutes - inspectionCost(command.channel), scans: state.scans - (command.channel === 'scan' ? 1 : 0), active: { ...active, inspected: [...active.inspected, command.channel] } };
  }
  if (command.type === 'refill') {
    requireRule(state.scans < CAMPAIGN.scans, 'The scanner already holds its maximum of three charges.');
    requireRule(state.credits >= CAMPAIGN.scanPrice, 'A scanner charge costs four credits.');
    requireRule(state.minutes >= 1, 'Refilling needs one inspection minute.');
    return { ...state, scans: state.scans + 1, credits: state.credits - CAMPAIGN.scanPrice, minutes: state.minutes - 1 };
  }
  if (command.type === 'bargain') {
    requireRule(active.bargain === null, 'Each traveller will negotiate only once.');
    requireRule(state.minutes >= 1, 'Negotiation needs one inspection minute.');
    const plan = command.plan;
    const traveller = TRAVELLERS[active.number - 1];
    const wallet = traveller.wallet - PACKAGING[active.plan.packing].price;
    requireRule(new Set(plan.disclosed).size === plan.disclosed.length, 'Disclosure cannot contain duplicate IDs.');
    if (plan.response === 'refuse') {
      requireRule(plan.amount === 0 && plan.disclosed.length === 0, 'A refusal cannot transfer credits or certify cargo.');
    } else if (command.question === 'bond') {
      requireRule(plan.amount >= 2 && plan.amount <= Math.min(4, wallet), 'A quarantine bond must be 2–4 credits and within the merchant’s remaining wallet.');
      requireRule(plan.disclosed.length === 0, 'A bond does not authenticate a disclosure.');
    } else {
      requireRule(plan.amount >= 1 && plan.amount <= Math.min(3, state.credits), 'A disclosure price must be 1–3 credits and affordable to the officer.');
      requireRule(plan.disclosed.length > 0 && plan.disclosed.every(id => active.plan.cargo.includes(id)), 'Certified disclosure must identify actual cargo, never invented evidence.');
    }
    return { ...state, minutes: state.minutes - 1, active: { ...active, bargain: { question: command.question, plan, resolved: plan.response === 'refuse' ? 'declined' : 'pending' } } };
  }
  if (command.type === 'settle') {
    const bargain = active.bargain;
    requireRule(bargain !== null && bargain.resolved === 'pending', 'There is no pending offer.');
    const cost = bargain.question === 'disclosure' && command.accept ? bargain.plan.amount : 0;
    requireRule(state.credits >= cost, 'The disclosure is no longer affordable.');
    return { ...state, credits: state.credits - cost, active: {
      ...active,
      certified: cost > 0 ? [...bargain.plan.disclosed] : active.certified,
      bargain: { ...bargain, resolved: command.accept ? 'accepted' : 'declined' },
    } };
  }
  requireRule(canStamp(state, command.verdict), 'This stamp is unavailable: an accepted bond binds quarantine, which otherwise costs two credits.');
  const ruling = adjudicate(active);
  const correct = ruling.verdict === command.verdict;
  const bond = acceptedBond(active);
  const fee = command.verdict === 'quarantine' ? CAMPAIGN.quarantineFee : 0;
  const trustCost = correct ? 0 : command.verdict === 'admit' ? 3 : command.verdict === 'return' ? 2 : 1;
  const delta = correct ? 20 : -12;
  const traveller = TRAVELLERS[active.number - 1];
  const value = active.plan.cargo.reduce((sum, id) => sum + cargoById(id).value, 0);
  const merchantUtility = (command.verdict === 'admit' ? value : command.verdict === 'quarantine' ? Math.ceil(value / 2) : 0) -
    PACKAGING[active.plan.packing].price - bond +
    (active.bargain?.question === 'disclosure' && active.bargain.resolved === 'accepted' ? active.bargain.plan.amount : 0) +
    (command.verdict === traveller.preference ? 2 : 0);
  const audit: Audit = { number: active.number, verdict: command.verdict, required: ruling.verdict, correct, reasons: ruling.reasons, cargo: [...active.plan.cargo], packing: active.plan.packing, delta, merchantUtility, bond };
  const audits = [...state.audits, audit];
  return { ...state, phase: audits.length === CAMPAIGN.travellers ? 'finished' : 'review', credits: state.credits + bond - fee, trust: Math.max(0, state.trust - trustCost), score: state.score + delta, audits };
}

export const definition = { id: 'custodian', create, reduce, parseCommand };
export function createSession(seed = 73): GameSession<State, Command> { return new GameSession(definition, seed); }
